// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Escrow
 * @dev 實現託管功能，管理租賃過程中的資金託管、違約處理和爭議解決
 */
contract Escrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 角色定義
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");
    bytes32 public constant RENTAL_CONTRACT_ROLE = keccak256("RENTAL_CONTRACT_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    
    // 託管狀態
    enum EscrowState {
        Created,     // 已創建
        Funded,      // 已注資
        Completed,   // 已完成
        Disputed,    // 爭議中
        Resolved,    // 已解決
        Cancelled    // 已取消
    }
    
    // 爭議類型
    enum DisputeType {
        LandlordDefault,  // 房東違約
        TenantDefault,    // 租客違約
        PropertyIssue,    // 物業問題
        Other             // 其他
    }
    
    // 爭議裁決結果
    enum Resolution {
        PendingResolution,   // 等待解決
        InFavorOfLandlord,   // 支持房東
        InFavorOfTenant,     // 支持租客
        Split                // 分攤
    }
    
    // 託管記錄
    struct EscrowRecord {
        uint256 rentalId;          // 租約ID
        address tenant;            // 租客地址
        address landlord;          // 房東地址
        uint256 rentalAmount;      // 租金金額
        uint256 landlordDeposit;   // 房東押金
        uint256 tenantDeposit;     // 租客押金 (如適用)
        EscrowState state;         // 託管狀態
        uint256 createdAt;         // 創建時間
        uint256 completedAt;       // 完成時間
        bool landlordClaimed;      // 房東是否已領取
        bool tenantClaimed;        // 租客是否已領取
    }
    
    // 爭議記錄
    struct DisputeRecord {
        uint256 escrowId;          // 託管ID
        DisputeType disputeType;   // 爭議類型
        address reporter;          // 報告人
        string evidence;           // 證據 (IPFS哈希)
        uint256 createdAt;         // 創建時間
        Resolution resolution;     // 裁決結果
        uint256 resolvedAt;        // 解決時間
        uint256 landlordShare;     // 房東分配比例 (基點)
        uint256 tenantShare;       // 租客分配比例 (基點)
        uint256 platformShare;     // 平台分配比例 (基點)
        string resolutionDetails;  // 裁決詳情
    }
    
    // 常數
    uint256 public constant BASIS_POINTS = 10000; // 基點 (100.00%)
    
    // 違約罰款設置
    uint256 public landlordDefaultPenalty = 3000; // 房東違約罰款 30%
    uint256 public tenantDefaultPenalty = 5000;   // 租客違約罰款 50%
    
    // 平台保障基金分配
    uint256 public insuranceFundShare = 6000;     // 平台分配中保障基金份額 60%
    
    // 狀態變數
    address public rentalContract;
    address public treasury;
    address public insuranceFund;
    address public stablecoin;
    uint256 public escrowCount;
    uint256 public disputeCount;
    
    mapping(uint256 => EscrowRecord) public escrows; // escrowId => EscrowRecord
    mapping(uint256 => DisputeRecord) public disputes; // disputeId => DisputeRecord
    mapping(uint256 => uint256) public rentalToEscrow; // rentalId => escrowId
    mapping(uint256 => uint256) public escrowToDispute; // escrowId => disputeId
    
    // 事件
    event EscrowCreated(uint256 escrowId, uint256 rentalId, address tenant, address landlord);
    event EscrowFunded(uint256 escrowId, uint256 rentalAmount, uint256 landlordDeposit);
    event EscrowCompleted(uint256 escrowId);
    event EscrowCancelled(uint256 escrowId);
    event DisputeCreated(uint256 disputeId, uint256 escrowId, DisputeType disputeType, address reporter);
    event DisputeResolved(uint256 disputeId, Resolution resolution, uint256 landlordShare, uint256 tenantShare);
    event FundsClaimed(uint256 escrowId, address claimer, uint256 amount);
    
    /**
     * @dev 初始化合約
     * @param _stablecoin 平台使用的穩定幣地址
     * @param _treasury 平台國庫地址
     * @param _insuranceFund 保障基金地址
     */
    constructor(address _stablecoin, address _treasury, address _insuranceFund) {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_insuranceFund != address(0), "Invalid insurance fund address");
        
        stablecoin = _stablecoin;
        treasury = _treasury;
        insuranceFund = _insuranceFund;
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(PLATFORM_ROLE, msg.sender);
        _setupRole(ARBITRATOR_ROLE, msg.sender);
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
     * @dev 設置違約罰款比例
     * @param _landlordPenalty 房東違約罰款比例
     * @param _tenantPenalty 租客違約罰款比例
     */
    function setDefaultPenalties(uint256 _landlordPenalty, uint256 _tenantPenalty) external onlyRole(PLATFORM_ROLE) {
        require(_landlordPenalty <= 5000, "Landlord penalty too high"); // 最高50%
        require(_tenantPenalty <= 7000, "Tenant penalty too high"); // 最高70%
        
        landlordDefaultPenalty = _landlordPenalty;
        tenantDefaultPenalty = _tenantPenalty;
    }
    
    /**
     * @dev 設置保障基金份額
     * @param _insuranceFundShare 新的份額 (基點)
     */
    function setInsuranceFundShare(uint256 _insuranceFundShare) external onlyRole(PLATFORM_ROLE) {
        require(_insuranceFundShare <= 10000, "Share too high");
        insuranceFundShare = _insuranceFundShare;
    }
    
    /**
     * @dev 添加仲裁員
     * @param _arbitrator 仲裁員地址
     */
    function addArbitrator(address _arbitrator) external onlyRole(PLATFORM_ROLE) {
        require(_arbitrator != address(0), "Invalid arbitrator address");
        _setupRole(ARBITRATOR_ROLE, _arbitrator);
    }
    
    /**
     * @dev 移除仲裁員
     * @param _arbitrator 仲裁員地址
     */
    function removeArbitrator(address _arbitrator) external onlyRole(PLATFORM_ROLE) {
        revokeRole(ARBITRATOR_ROLE, _arbitrator);
    }
    
    /**
     * @dev 創建託管
     * @param _rentalId 租約ID
     * @param _tenant 租客地址
     * @param _landlord 房東地址
     * @param _rentalAmount 租金金額
     * @param _landlordDeposit 房東押金
     * @return escrowId 託管ID
     */
    function createEscrow(
        uint256 _rentalId,
        address _tenant,
        address _landlord,
        uint256 _rentalAmount,
        uint256 _landlordDeposit
    ) external onlyRole(RENTAL_CONTRACT_ROLE) returns (uint256) {
        require(_tenant != address(0), "Invalid tenant address");
        require(_landlord != address(0), "Invalid landlord address");
        require(_rentalAmount > 0, "Rental amount must be positive");
        require(rentalToEscrow[_rentalId] == 0, "Escrow already exists for this rental");
        
        escrowCount++;
        uint256 escrowId = escrowCount;
        
        escrows[escrowId] = EscrowRecord({
            rentalId: _rentalId,
            tenant: _tenant,
            landlord: _landlord,
            rentalAmount: _rentalAmount,
            landlordDeposit: _landlordDeposit,
            tenantDeposit: 0, // 暫不處理租客押金
            state: EscrowState.Created,
            createdAt: block.timestamp,
            completedAt: 0,
            landlordClaimed: false,
            tenantClaimed: false
        });
        
        rentalToEscrow[_rentalId] = escrowId;
        
        emit EscrowCreated(escrowId, _rentalId, _tenant, _landlord);
        
        return escrowId;
    }
    
    /**
     * @dev 注資託管
     * @param _escrowId 託管ID
     */
    function fundEscrow(uint256 _escrowId) external nonReentrant {
        EscrowRecord storage escrow = escrows[_escrowId];
        require(escrow.rentalId != 0, "Escrow does not exist");
        require(escrow.state == EscrowState.Created, "Escrow not in created state");
        
        // 驗證發送方是租客或房東
        bool isTenant = msg.sender == escrow.tenant;
        bool isLandlord = msg.sender == escrow.landlord;
        require(isTenant || isLandlord, "Not authorized");
        
        uint256 amount;
        if (isTenant) {
            amount = escrow.rentalAmount;
        } else {
            amount = escrow.landlordDeposit;
        }
        
        // 轉移資金到合約
        IERC20(stablecoin).safeTransferFrom(msg.sender, address(this), amount);
        
        // 更新託管狀態
        escrow.state = EscrowState.Funded;
        
        emit EscrowFunded(_escrowId, escrow.rentalAmount, escrow.landlordDeposit);
    }
    
    /**
     * @dev 完成託管
     * @param _escrowId 託管ID
     */
    function completeEscrow(uint256 _escrowId) external onlyRole(RENTAL_CONTRACT_ROLE) {
        EscrowRecord storage escrow = escrows[_escrowId];
        require(escrow.rentalId != 0, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded, "Escrow not in funded state");
        require(escrowToDispute[_escrowId] == 0, "Escrow is in dispute");
        
        escrow.state = EscrowState.Completed;
        escrow.completedAt = block.timestamp;
        
        emit EscrowCompleted(_escrowId);
    }
    
    /**
     * @dev 取消託管
     * @param _escrowId 託管ID
     */
    function cancelEscrow(uint256 _escrowId) external onlyRole(RENTAL_CONTRACT_ROLE) {
        EscrowRecord storage escrow = escrows[_escrowId];
        require(escrow.rentalId != 0, "Escrow does not exist");
        require(escrow.state == EscrowState.Created || escrow.state == EscrowState.Funded, "Invalid state for cancellation");
        
        escrow.state = EscrowState.Cancelled;
        
        // 如果已經有資金注入，將資金退還
        if (escrow.state == EscrowState.Funded) {
            // 退還租客資金
            if (!escrow.tenantClaimed) {
                IERC20(stablecoin).safeTransfer(escrow.tenant, escrow.rentalAmount);
                escrow.tenantClaimed = true;
            }
            
            // 退還房東押金
            if (!escrow.landlordClaimed) {
                IERC20(stablecoin).safeTransfer(escrow.landlord, escrow.landlordDeposit);
                escrow.landlordClaimed = true;
            }
        }
        
        emit EscrowCancelled(_escrowId);
    }
    
    /**
     * @dev 創建爭議
     * @param _escrowId 託管ID
     * @param _disputeType 爭議類型
     * @param _evidence 證據IPFS哈希
     */
    function createDispute(
        uint256 _escrowId,
        DisputeType _disputeType,
        string memory _evidence
    ) external nonReentrant {
        EscrowRecord storage escrow = escrows[_escrowId];
        require(escrow.rentalId != 0, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded, "Escrow not in funded state");
        require(msg.sender == escrow.tenant || msg.sender == escrow.landlord, "Not authorized");
        require(escrowToDispute[_escrowId] == 0, "Dispute already exists");
        
        // 更新託管狀態
        escrow.state = EscrowState.Disputed;
        
        // 創建爭議記錄
        disputeCount++;
        uint256 disputeId = disputeCount;
        
        disputes[disputeId] = DisputeRecord({
            escrowId: _escrowId,
            disputeType: _disputeType,
            reporter: msg.sender,
            evidence: _evidence,
            createdAt: block.timestamp,
            resolution: Resolution.PendingResolution,
            resolvedAt: 0,
            landlordShare: 0,
            tenantShare: 0,
            platformShare: 0,
            resolutionDetails: ""
        });
        
        escrowToDispute[_escrowId] = disputeId;
        
        emit DisputeCreated(disputeId, _escrowId, _disputeType, msg.sender);
    }
    
    /**
     * @dev 解決爭議
     * @param _disputeId 爭議ID
     * @param _resolution 裁決結果
     * @param _landlordShare 房東分配份額
     * @param _tenantShare 租客分配份額
     * @param _platformShare 平台分配份額
     * @param _resolutionDetails 裁決詳情
     */
    function resolveDispute(
        uint256 _disputeId,
        Resolution _resolution,
        uint256 _landlordShare,
        uint256 _tenantShare,
        uint256 _platformShare,
        string memory _resolutionDetails
    ) external onlyRole(ARBITRATOR_ROLE) {
        DisputeRecord storage dispute = disputes[_disputeId];
        require(dispute.escrowId != 0, "Dispute does not exist");
        require(dispute.resolution == Resolution.PendingResolution, "Dispute already resolved");
        
        // 驗證分配比例總和為100%
        require(_landlordShare + _tenantShare + _platformShare == BASIS_POINTS, "Shares must sum to 100%");
        
        // 更新爭議記錄
        dispute.resolution = _resolution;
        dispute.resolvedAt = block.timestamp;
        dispute.landlordShare = _landlordShare;
        dispute.tenantShare = _tenantShare;
        dispute.platformShare = _platformShare;
        dispute.resolutionDetails = _resolutionDetails;
        
        // 更新相關託管狀態
        EscrowRecord storage escrow = escrows[dispute.escrowId];
        escrow.state = EscrowState.Resolved;
        
        emit DisputeResolved(_disputeId, _resolution, _landlordShare, _tenantShare);
    }
    
    /**
     * @dev 領取資金
     * @param _escrowId 託管ID
     */
    function claimFunds(uint256 _escrowId) external nonReentrant {
        EscrowRecord storage escrow = escrows[_escrowId];
        require(escrow.rentalId != 0, "Escrow does not exist");
        require(escrow.state == EscrowState.Completed || escrow.state == EscrowState.Resolved, "Escrow not completed or resolved");
        
        bool isTenant = msg.sender == escrow.tenant;
        bool isLandlord = msg.sender == escrow.landlord;
        require(isTenant || isLandlord, "Not authorized");
        
        // 處理已完成的託管
        if (escrow.state == EscrowState.Completed) {
            if (isTenant && !escrow.tenantClaimed) {
                // 租客不需要領取任何資金，租金已付給房東
                escrow.tenantClaimed = true;
                emit FundsClaimed(_escrowId, escrow.tenant, 0);
                return;
            } else if (isLandlord && !escrow.landlordClaimed) {
                // 房東領取租金和押金
                uint256 amount = escrow.rentalAmount + escrow.landlordDeposit;
                IERC20(stablecoin).safeTransfer(escrow.landlord, amount);
                escrow.landlordClaimed = true;
                emit FundsClaimed(_escrowId, escrow.landlord, amount);
                return;
            }
        }
        
        // 處理解決爭議後的託管
        if (escrow.state == EscrowState.Resolved) {
            uint256 disputeId = escrowToDispute[_escrowId];
            DisputeRecord storage dispute = disputes[disputeId];
            
            uint256 totalFunds = escrow.rentalAmount + escrow.landlordDeposit;
            
            if (isTenant && !escrow.tenantClaimed) {
                uint256 tenantAmount = (totalFunds * dispute.tenantShare) / BASIS_POINTS;
                if (tenantAmount > 0) {
                    IERC20(stablecoin).safeTransfer(escrow.tenant, tenantAmount);
                }
                escrow.tenantClaimed = true;
                emit FundsClaimed(_escrowId, escrow.tenant, tenantAmount);
            } else if (isLandlord && !escrow.landlordClaimed) {
                uint256 landlordAmount = (totalFunds * dispute.landlordShare) / BASIS_POINTS;
                if (landlordAmount > 0) {
                    IERC20(stablecoin).safeTransfer(escrow.landlord, landlordAmount);
                }
                escrow.landlordClaimed = true;
                emit FundsClaimed(_escrowId, escrow.landlord, landlordAmount);
            }
            
            // 處理平台份額 (如果雙方都已領取)
            if (escrow.tenantClaimed && escrow.landlordClaimed) {
                uint256 platformAmount = (totalFunds * dispute.platformShare) / BASIS_POINTS;
                if (platformAmount > 0) {
                    // 分配給保障基金和國庫
                    uint256 insuranceAmount = (platformAmount * insuranceFundShare) / BASIS_POINTS;
                    uint256 treasuryAmount = platformAmount - insuranceAmount;
                    
                    if (insuranceAmount > 0) {
                        IERC20(stablecoin).safeTransfer(insuranceFund, insuranceAmount);
                    }
                    
                    if (treasuryAmount > 0) {
                        IERC20(stablecoin).safeTransfer(treasury, treasuryAmount);
                    }
                }
            }
        }
        
        require(isTenant ? escrow.tenantClaimed : escrow.landlordClaimed, "Already claimed");
    }
    
    /**
     * @dev 房東違約處理
     * @param _escrowId 託管ID
     */
    function landlordDefault(uint256 _escrowId) external onlyRole(PLATFORM_ROLE) {
        EscrowRecord storage escrow = escrows[_escrowId];
        require(escrow.rentalId != 0, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded, "Escrow not in funded state");
        
        // 計算罰款金額
        uint256 penaltyAmount = (escrow.rentalAmount * landlordDefaultPenalty) / BASIS_POINTS;
        
        // 計算租客賠償金額 (30% 的 1/3)
        uint256 tenantCompensation = (penaltyAmount * 3333) / BASIS_POINTS;
        
        // 計算平台份額 (剩餘部分)
        uint256 platformAmount = penaltyAmount - tenantCompensation;
        
        // 從房東押金中扣除
        require(escrow.landlordDeposit >= penaltyAmount, "Insufficient landlord deposit");
        
        // 支付租客賠償金
        IERC20(stablecoin).safeTransfer(escrow.tenant, tenantCompensation + escrow.rentalAmount);
        escrow.tenantClaimed = true;
        
        // 分配平台份額
        uint256 insuranceAmount = (platformAmount * insuranceFundShare) / BASIS_POINTS;
        uint256 treasuryAmount = platformAmount - insuranceAmount;
        
        IERC20(stablecoin).safeTransfer(insuranceFund, insuranceAmount);
        IERC20(stablecoin).safeTransfer(treasury, treasuryAmount);
        
        // 返還房東剩餘押金
        uint256 remainingDeposit = escrow.landlordDeposit - penaltyAmount;
        if (remainingDeposit > 0) {
            IERC20(stablecoin).safeTransfer(escrow.landlord, remainingDeposit);
        }
        escrow.landlordClaimed = true;
        
        // 更新託管狀態
        escrow.state = EscrowState.Completed;
        escrow.completedAt = block.timestamp;
        
        emit EscrowCompleted(_escrowId);
    }
    
    /**
     * @dev 獲取託管詳情
     * @param _escrowId 託管ID
     * @return 託管記錄
     */
    function getEscrowDetails(uint256 _escrowId) external view returns (EscrowRecord memory) {
        return escrows[_escrowId];
    }
    
    /**
     * @dev 獲取爭議詳情
     * @param _disputeId 爭議ID
     * @return 爭議記錄
     */
    function getDisputeDetails(uint256 _disputeId) external view returns (DisputeRecord memory) {
        return disputes[_disputeId];
    }
    
    /**
     * @dev 從租約ID獲取託管ID
     * @param _rentalId 租約ID
     * @return 託管ID
     */
    function getEscrowIdFromRental(uint256 _rentalId) external view returns (uint256) {
        return rentalToEscrow[_rentalId];
    }
    
    /**
     * @dev 緊急提款 (僅平台管理員可調用)
     * @param _token 代幣地址
     * @param _amount 金額
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyRole(PLATFORM_ROLE) {
        IERC20(_token).safeTransfer(treasury, _amount);
    }