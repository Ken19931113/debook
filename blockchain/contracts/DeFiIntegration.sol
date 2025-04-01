// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/**
 * @title DeFiIntegration
 * @dev 實現與 DeFi 協議的整合，管理資金質押和收益分配
 */
contract DeFiIntegration is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 角色定義
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");
    bytes32 public constant RENTAL_CONTRACT_ROLE = keccak256("RENTAL_CONTRACT_ROLE");
    
    // 風險等級
    enum RiskLevel {
        Conservative, // 保守型 (穩定幣)
        Balanced,     // 平衡型
        Growth        // 成長型
    }
    
    // 收益策略
    struct YieldStrategy {
        address protocol;        // 協議地址
        address depositToken;    // 存款代幣
        address yieldToken;      // 收益代幣
        uint256 expectedAPY;     // 預期年化收益率 (基點)
        uint256 riskLevel;       // 風險等級
        bool active;             // 是否啟用
    }
    
    // 租約質押記錄
    struct StakeRecord {
        uint256 rentalId;        // 租約ID
        uint256 baseAmount;      // 基礎金額
        uint256 landlordDeposit; // 房東押金
        uint256 startTime;       // 開始時間
        uint256 endTime;         // 結束時間
        uint256 baseYieldStrategy; // 基礎收益策略ID
        uint256 plusYieldStrategy; // 高級收益策略ID
        bool active;             // 是否活躍
        uint256 baseAccruedYield; // 基礎已累計收益
        uint256 plusAccruedYield; // 高級已累計收益
    }
    
    // 收益分配比例
    struct YieldDistribution {
        uint256 tenantShare;     // 租客份額 (基點)
        uint256 landlordShare;   // 房東份額 (基點)
        uint256 platformShare;   // 平台份額 (基點)
    }
    
    // 常數
    uint256 public constant BASIS_POINTS = 10000; // 基點 (100.00%)
    
    // 狀態變數
    address public rentalContract;
    address public treasury;
    address public stablecoin; // 平台使用的穩定幣
    YieldStrategy[] public yieldStrategies;
    mapping(uint256 => StakeRecord) public stakeRecords;
    
    // 收益分配比例
    YieldDistribution public baseYieldDistribution = YieldDistribution({
        tenantShare: 7000,       // 70%
        landlordShare: 1000,     // 10%
        platformShare: 2000      // 20%
    });
    
    YieldDistribution public plusYieldDistribution = YieldDistribution({
        tenantShare: 6000,       // 60%
        landlordShare: 1000,     // 10%
        platformShare: 3000      // 30%
    });
    
    // 平台保障基金比例
    uint256 public insuranceFundShare = 500; // 平台份額中的5%
    
    // 事件
    event StrategyAdded(uint256 strategyId, address protocol, uint256 expectedAPY, uint256 riskLevel);
    event StakeCreated(uint256 rentalId, uint256 amount, uint256 baseStrategy, uint256 plusStrategy);
    event YieldCollected(uint256 rentalId, uint256 baseYield, uint256 plusYield);
    event StakeWithdrawn(uint256 rentalId, uint256 amount, uint256 baseYield, uint256 plusYield);
    
    /**
     * @dev 初始化合約
     * @param _stablecoin 平台使用的穩定幣地址
     * @param _treasury 平台國庫地址
     */
    constructor(address _stablecoin, address _treasury) {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        require(_treasury != address(0), "Invalid treasury address");
        
        stablecoin = _stablecoin;
        treasury = _treasury;
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(PLATFORM_ROLE, msg.sender);
    }
    
    /**
     * @dev 設置租約合約地址
     * @param _rentalContract 租約合約地址
     */
    function setRentalContract(address _rentalContract) external onlyRole(PLATFORM_ROLE) {
        require(_rentalContract != address(0), "Invalid rental contract address");
        rentalContract = _rentalContract;
        _setupRole(RENTAL_CONTRACT_ROLE, _rentalContract);
    }
    
    /**
     * @dev 添加收益策略
     * @param _protocol 協議地址
     * @param _depositToken 存款代幣地址
     * @param _yieldToken 收益代幣地址
     * @param _expectedAPY 預期年化收益率
     * @param _riskLevel 風險等級
     */
    function addYieldStrategy(
        address _protocol,
        address _depositToken,
        address _yieldToken,
        uint256 _expectedAPY,
        uint256 _riskLevel
    ) external onlyRole(PLATFORM_ROLE) {
        require(_protocol != address(0), "Invalid protocol address");
        require(_depositToken != address(0), "Invalid deposit token address");
        require(_yieldToken != address(0), "Invalid yield token address");
        require(_riskLevel <= uint256(RiskLevel.Growth), "Invalid risk level");
        
        yieldStrategies.push(YieldStrategy({
            protocol: _protocol,
            depositToken: _depositToken,
            yieldToken: _yieldToken,
            expectedAPY: _expectedAPY,
            riskLevel: _riskLevel,
            active: true
        }));
        
        emit StrategyAdded(yieldStrategies.length - 1, _protocol, _expectedAPY, _riskLevel);
    }
    
    /**
     * @dev 設置收益分配比例
     * @param _tenantShare 租客份額
     * @param _landlordShare 房東份額
     * @param _platformShare 平台份額
     * @param _isBasic 是否為基礎收益分配
     */
    function setYieldDistribution(
        uint256 _tenantShare,
        uint256 _landlordShare,
        uint256 _platformShare,
        bool _isBasic
    ) external onlyRole(PLATFORM_ROLE) {
        require(_tenantShare + _landlordShare + _platformShare == BASIS_POINTS, "Shares must sum to 100%");
        
        if (_isBasic) {
            baseYieldDistribution = YieldDistribution({
                tenantShare: _tenantShare,
                landlordShare: _landlordShare,
                platformShare: _platformShare
            });
        } else {
            plusYieldDistribution = YieldDistribution({
                tenantShare: _tenantShare,
                landlordShare: _landlordShare,
                platformShare: _platformShare
            });
        }
    }
    
    /**
     * @dev 設置保障基金份額
     * @param _share 新的份額 (基點)
     */
    function setInsuranceFundShare(uint256 _share) external onlyRole(PLATFORM_ROLE) {
        require(_share <= 2000, "Share too high"); // 最高20%
        insuranceFundShare = _share;
    }
    
    /**
     * @dev 創建租約質押
     * @param _rentalId 租約ID
     * @param _amount 金額
     * @param _landlordDeposit 房東押金
     * @param _duration 租期 (秒)
     * @param _baseStrategy 基礎策略ID
     * @param _plusStrategy 高級策略ID (如不需要則設為 type(uint256).max)
     */
    function createStake(
        uint256 _rentalId,
        uint256 _amount,
        uint256 _landlordDeposit,
        uint256 _duration,
        uint256 _baseStrategy,
        uint256 _plusStrategy
    ) external nonReentrant onlyRole(RENTAL_CONTRACT_ROLE) {
        require(_amount > 0, "Amount must be positive");
        require(_baseStrategy < yieldStrategies.length, "Invalid base strategy");
        require(_plusStrategy == type(uint256).max || _plusStrategy < yieldStrategies.length, "Invalid plus strategy");
        require(stakeRecords[_rentalId].rentalId == 0, "Stake already exists");
        
        // 檢查基礎策略是否啟用
        require(yieldStrategies[_baseStrategy].active, "Base strategy not active");
        
        // 檢查高級策略是否啟用 (如有)
        if (_plusStrategy != type(uint256).max) {
            require(yieldStrategies[_plusStrategy].active, "Plus strategy not active");
        }
        
        // 創建質押記錄
        stakeRecords[_rentalId] = StakeRecord({
            rentalId: _rentalId,
            baseAmount: _amount,
            landlordDeposit: _landlordDeposit,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            baseYieldStrategy: _baseStrategy,
            plusYieldStrategy: _plusStrategy,
            active: true,
            baseAccruedYield: 0,
            plusAccruedYield: 0
        });
        
        // 提取租金和押金到本合約
        IERC20(stablecoin).safeTransferFrom(msg.sender, address(this), _amount + _landlordDeposit);
        
        // 執行基礎策略質押
        YieldStrategy storage baseStrategy = yieldStrategies[_baseStrategy];
        IERC20(stablecoin).safeApprove(baseStrategy.protocol, _amount);
        ILendingPool(baseStrategy.protocol).deposit(
            stablecoin,
            _amount,
            address(this),
            0 // referralCode
        );
        
        // 執行高級策略質押 (如有)
        if (_plusStrategy != type(uint256).max) {
            YieldStrategy storage plusStrategy = yieldStrategies[_plusStrategy];
            IERC20(stablecoin).safeApprove(plusStrategy.protocol, _landlordDeposit);
            ILendingPool(plusStrategy.protocol).deposit(
                stablecoin,
                _landlordDeposit,
                address(this),
                0 // referralCode
            );
        }
        
        emit StakeCreated(_rentalId, _amount, _baseStrategy, _plusStrategy);
    }
    
    /**
     * @dev 估算當前收益
     * @param _rentalId 租約ID
     * @return baseYield 基礎收益
     * @return plusYield 高級收益
     */
    function estimateCurrentYield(uint256 _rentalId) public view returns (uint256 baseYield, uint256 plusYield) {
        StakeRecord storage record = stakeRecords[_rentalId];
        require(record.rentalId != 0, "Stake does not exist");
        
        // 基礎收益計算
        YieldStrategy storage baseStrategy = yieldStrategies[record.baseYieldStrategy];
        uint256 timeElapsed = block.timestamp < record.endTime ? 
            block.timestamp - record.startTime : 
            record.endTime - record.startTime;
        
        baseYield = (record.baseAmount * baseStrategy.expectedAPY * timeElapsed) / (BASIS_POINTS * 365 days);
        
        // 高級收益計算 (如有)
        if (record.plusYieldStrategy != type(uint256).max) {
            YieldStrategy storage plusStrategy = yieldStrategies[record.plusYieldStrategy];
            plusYield = (record.landlordDeposit * plusStrategy.expectedAPY * timeElapsed) / (BASIS_POINTS * 365 days);
        }
        
        return (baseYield, plusYield);
    }
    
    /**
     * @dev 收集並分配收益
     * @param _rentalId 租約ID
     */
    function collectYield(uint256 _rentalId) external nonReentrant onlyRole(PLATFORM_ROLE) {
        StakeRecord storage record = stakeRecords[_rentalId];
        require(record.rentalId != 0, "Stake does not exist");
        require(record.active, "Stake not active");
        
        // 估算當前收益
        (uint256 baseYield, uint256 plusYield) = estimateCurrentYield(_rentalId);
        
        // 更新累計收益
        record.baseAccruedYield += baseYield;
        record.plusAccruedYield += plusYield;
        
        // 分配基礎收益
        if (baseYield > 0) {
            // 計算各方份額
            uint256 tenantShare = (baseYield * baseYieldDistribution.tenantShare) / BASIS_POINTS;
            uint256 landlordShare = (baseYield * baseYieldDistribution.landlordShare) / BASIS_POINTS;
            uint256 platformShare = (baseYield * baseYieldDistribution.platformShare) / BASIS_POINTS;
            
            // 計算保障基金份額
            uint256 insuranceAmount = (platformShare * insuranceFundShare) / BASIS_POINTS;
            uint256 treasuryAmount = platformShare - insuranceAmount;
            
            // 提取收益 (簡化版本，實際實現需要與具體協議對接)
            // 此處假設收益已經在協議中累計，可以直接提取
            
            // 分配收益給各方 (實際實現可能需要更複雜的邏輯)
            // 此處簡化為將收益記錄在合約狀態中，待提取
        }
        
        // 分配高級收益 (如有)
        if (plusYield > 0) {
            // 類似邏輯...
        }
        
        emit YieldCollected(_rentalId, baseYield, plusYield);
    }
    
    /**
     * @dev 結束質押，提取資金和收益
     * @param _rentalId 租約ID
     */
    function endStake(uint256 _rentalId) external nonReentrant onlyRole(RENTAL_CONTRACT_ROLE) {
        StakeRecord storage record = stakeRecords[_rentalId];
        require(record.rentalId != 0, "Stake does not exist");
        require(record.active, "Stake not active");
        
        // 收集最終收益
        collectYield(_rentalId);
        
        // 從協議中提取資金
        YieldStrategy storage baseStrategy = yieldStrategies[record.baseYieldStrategy];
        ILendingPool(baseStrategy.protocol).withdraw(
            stablecoin,
            record.baseAmount,
            address(this)
        );
        
        // 提取房東押金 (如適用)
        if (record.plusYieldStrategy != type(uint256).max) {
            YieldStrategy storage plusStrategy = yieldStrategies[record.plusYieldStrategy];
            ILendingPool(plusStrategy.protocol).withdraw(
                stablecoin,
                record.landlordDeposit,
                address(this)
            );
        }
        
        // 將資金和最終收益轉回租約合約
        IERC20(stablecoin).safeTransfer(rentalContract, record.baseAmount + record.landlordDeposit);
        
        // 標記質押為非活躍
        record.active = false;
        
        emit StakeWithdrawn(_rentalId, record.baseAmount, record.baseAccruedYield, record.plusAccruedYield);
    }
    
    /**
     * @dev 獲取可用策略數量
     * @return 策略數量
     */
    function getStrategyCount() external view returns (uint256) {
        return yieldStrategies.length;
    }
    
    /**
     * @dev 緊急提款 (僅平台管理員可調用)
     * @param _token 代幣地址
     * @param _amount 金額
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyRole(PLATFORM_ROLE) {
        IERC20(_token).safeTransfer(treasury, _amount);
    }
}