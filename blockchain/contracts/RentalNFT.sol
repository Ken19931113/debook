// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title RentalNFT
 * @dev 實現長期租賃 NFT 合約，管理租約生命週期
 */
contract RentalNFT is ERC721URIStorage, AccessControl, ReentrancyGuard {
    using Counters for Counters.Counter;
    
    // 角色定義
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");
    bytes32 public constant LANDLORD_ROLE = keccak256("LANDLORD_ROLE");
    bytes32 public constant TENANT_ROLE = keccak256("TENANT_ROLE");
    
    // 租約狀態
    enum RentalState { 
        Available,      // 可供租賃
        Reserved,       // 已預訂
        Active,         // 正在進行中
        Completed,      // 已完成
        Cancelled,      // 已取消
        Disputed        // 爭議中
    }
    
    // 租金計算方式
    enum PricingModel {
        Fixed,          // 固定價格
        DynamicWithFloor // 動態定價（有底價）
    }
    
    // 租約記錄結構
    struct RentalRecord {
        uint256 propertyId;          // 物業ID
        address landlord;            // 房東地址
        address tenant;              // 租客地址
        uint256 startDate;           // 開始日期 (Unix timestamp)
        uint256 endDate;             // 結束日期 (Unix timestamp)
        uint256 basePrice;           // 基礎價格 (不包含折扣)
        uint256 finalPrice;          // 最終價格 (包含所有折扣)
        uint256 deposit;             // 房東押金
        uint256 discountA;           // 提前預訂折扣率 (分母為10000)
        uint256 discountBBase;       // 基礎DeFi收益折扣
        uint256 discountBPlus;       // 高級DeFi收益折扣
        RentalState state;           // 租約狀態
        bool allowTransfer;          // 是否允許轉讓
        uint256 cancelDeadline;      // 免費取消截止日期
        string metadataURI;          // 關聯元數據URI
    }
    
    // 物業基本信息
    struct Property {
        address owner;               // 擁有者地址
        string location;             // 位置信息
        uint256 pricePerMonth;       // 每月租金
        uint256 minRentalDuration;   // 最短租期(月)
        uint256 maxRentalDuration;   // 最長租期(月)
        bool available;              // 是否可用
        PricingModel pricingModel;   // 定價模型
        uint256 depositRequirement;  // 押金要求(租金的百分比)
        string metadataURI;          // 物業元數據URI
    }
    
    // 平台費用和政策
    uint256 public platformFeePercent = 300;  // 平台費用百分比 (3.00%)
    uint256 public landlordDepositPercent = 3000; // 房東押金百分比 (30.00%)
    uint256 public constant BASIS_POINTS = 10000; // 百分比基準點 (100.00%)
    
    // 取消政策
    uint256 public constant CANCEL_30_DAYS_REFUND = 10000; // 30天前取消 100% 退款
    uint256 public constant CANCEL_7_30_DAYS_REFUND = 9500; // 7-30天前取消 95% 退款
    uint256 public constant CANCEL_1_7_DAYS_REFUND = 9000; // 1-7天前取消 90% 退款
    uint256 public constant CANCEL_0_1_DAYS_REFUND = 8000; // 0-1天前取消 80% 退款
    
    // 違約罰款
    uint256 public constant LANDLORD_DEFAULT_PENALTY = 3000; // 房東違約罰款 30%
    uint256 public constant TENANT_DEFAULT_PENALTY = 5000; // 租客違約罰款 50%
    
    // 計數器
    Counters.Counter private _tokenIds;
    Counters.Counter private _propertyIds;
    
    // 映射
    mapping(uint256 => RentalRecord) public rentalRecords;
    mapping(uint256 => Property) public properties;
    mapping(address => uint256[]) public landlordProperties;
    mapping(address => uint256[]) public tenantRentals;
    mapping(uint256 => uint256) public propertyToActiveRental;
    
    // DeFi收益相關
    address public defiIntegrationContract;
    
    // 事件
    event PropertyListed(uint256 indexed propertyId, address indexed owner, uint256 pricePerMonth);
    event RentalCreated(uint256 indexed tokenId, address indexed tenant, address indexed landlord, uint256 startDate, uint256 endDate, uint256 finalPrice);
    event RentalStateChanged(uint256 indexed tokenId, RentalState state);
    event RentalCancelled(uint256 indexed tokenId, address indexed cancelledBy, uint256 refundAmount);
    event RentalCompleted(uint256 indexed tokenId);
    event RentalDisputed(uint256 indexed tokenId, address reporter);
    event RentalTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    
    /**
     * @dev 初始化合約
     */
    constructor() ERC721("DeBooK Rental NFT", "RENT") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(PLATFORM_ROLE, msg.sender);
    }
    
    /**
     * @dev 設置DeFi集成合約地址
     * @param _defiContract DeFi集成合約地址
     */
    function setDefiIntegrationContract(address _defiContract) external onlyRole(PLATFORM_ROLE) {
        defiIntegrationContract = _defiContract;
    }
    
    /**
     * @dev 更新平台費用百分比
     * @param _newFeePercent 新的平台費用百分比
     */
    function updatePlatformFee(uint256 _newFeePercent) external onlyRole(PLATFORM_ROLE) {
        require(_newFeePercent <= 1000, "Fee too high"); // 最高10%
        platformFeePercent = _newFeePercent;
    }
    
    /**
     * @dev 更新房東押金百分比
     * @param _newDepositPercent 新的房東押金百分比
     */
    function updateLandlordDepositPercent(uint256 _newDepositPercent) external onlyRole(PLATFORM_ROLE) {
        require(_newDepositPercent <= 5000, "Deposit too high"); // 最高50%
        landlordDepositPercent = _newDepositPercent;
    }
    
    /**
     * @dev 列出物業
     * @param _location 位置信息
     * @param _pricePerMonth 每月租金
     * @param _minRentalDuration 最短租期
     * @param _maxRentalDuration 最長租期
     * @param _depositRequirement 房東押金要求
     * @param _metadataURI 物業元數據URI
     * @return 新物業ID
     */
    function listProperty(
        string memory _location,
        uint256 _pricePerMonth,
        uint256 _minRentalDuration,
        uint256 _maxRentalDuration,
        uint256 _depositRequirement,
        string memory _metadataURI
    ) external returns (uint256) {
        require(_pricePerMonth > 0, "Price must be greater than 0");
        require(_minRentalDuration > 0, "Min duration must be > 0");
        require(_maxRentalDuration >= _minRentalDuration, "Max duration must be >= min");
        
        _propertyIds.increment();
        uint256 propertyId = _propertyIds.current();
        
        properties[propertyId] = Property({
            owner: msg.sender,
            location: _location,
            pricePerMonth: _pricePerMonth,
            minRentalDuration: _minRentalDuration,
            maxRentalDuration: _maxRentalDuration,
            available: true,
            pricingModel: PricingModel.Fixed,
            depositRequirement: _depositRequirement,
            metadataURI: _metadataURI
        });
        
        landlordProperties[msg.sender].push(propertyId);
        _setupRole(LANDLORD_ROLE, msg.sender);
        
        emit PropertyListed(propertyId, msg.sender, _pricePerMonth);
        
        return propertyId;
    }
    
    /**
     * @dev 計算租約的總價格和折扣
     * @param _propertyId 物業ID
     * @param _startDate 開始日期
     * @param _endDate 結束日期
     * @param _advanceBookingDays 提前預訂天數
     * @return basePrice 基礎價格
     * @return discountA 提前預訂折扣
     * @return finalPrice 最終價格(含折扣A)
     */
    function calculateRentalPrice(
        uint256 _propertyId,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _advanceBookingDays
    ) public view returns (uint256 basePrice, uint256 discountA, uint256 finalPrice) {
        Property storage property = properties[_propertyId];
        require(property.owner != address(0), "Property does not exist");
        
        // 計算租期月數 (簡化版本，假設每月30天)
        uint256 durationInDays = (_endDate - _startDate) / 1 days;
        uint256 durationInMonths = durationInDays / 30;
        
        // 計算基礎價格
        basePrice = property.pricePerMonth * durationInMonths;
        
        // 計算提前預訂折扣 (discountA)
        if (_advanceBookingDays >= 180) { // 6+ 月前: 20%
            discountA = (basePrice * 2000) / BASIS_POINTS;
        } else if (_advanceBookingDays >= 90) { // 3-6 月前: 15%
            discountA = (basePrice * 1500) / BASIS_POINTS;
        } else if (_advanceBookingDays >= 30) { // 1-3 月前: 10%
            discountA = (basePrice * 1000) / BASIS_POINTS;
        } else { // <1 月: 5%
            discountA = (basePrice * 500) / BASIS_POINTS;
        }
        
        // 計算最終價格
        finalPrice = basePrice - discountA;
        
        return (basePrice, discountA, finalPrice);
    }
    
    /**
     * @dev 創建租約 (租客調用)
     * @param _propertyId 物業ID
     * @param _startDate 開始日期
     * @param _endDate 結束日期
     * @return 租約 NFT 的 tokenId
     */
    function createRental(
        uint256 _propertyId,
        uint256 _startDate,
        uint256 _endDate
    ) external payable nonReentrant returns (uint256) {
        Property storage property = properties[_propertyId];
        require(property.owner != address(0), "Property does not exist");
        require(property.available, "Property not available");
        require(_startDate > block.timestamp, "Start date must be in future");
        require(_endDate > _startDate, "End date must be after start");
        
        // 計算租期月數
        uint256 durationInDays = (_endDate - _startDate) / 1 days;
        uint256 durationInMonths = durationInDays / 30;
        require(durationInMonths >= property.minRentalDuration, "Rental duration too short");
        require(durationInMonths <= property.maxRentalDuration, "Rental duration too long");
        
        // 計算提前預訂天數
        uint256 advanceBookingDays = (_startDate - block.timestamp) / 1 days;
        
        // 計算價格和折扣
        (uint256 basePrice, uint256 discountA, uint256 finalPrice) = calculateRentalPrice(
            _propertyId,
            _startDate,
            _endDate,
            advanceBookingDays
        );
        
        // 計算平台費
        uint256 platformFee = (finalPrice * platformFeePercent) / BASIS_POINTS;
        uint256 totalPayment = finalPrice + platformFee;
        
        // 檢查支付金額
        require(msg.value >= totalPayment, "Insufficient payment");
        
        // 轉發房東應得款項 (此處簡化，實際應該通過DeFi整合合約處理)
        uint256 landlordPayment = finalPrice - platformFee;
        payable(property.owner).transfer(landlordPayment);
        
        // 更新物業狀態
        property.available = false;
        
        // 創建NFT租約
        _tokenIds.increment();
        uint256 tokenId = _tokenIds.current();
        _mint(msg.sender, tokenId);
        
        // 計算取消截止日期 (入住前30天)
        uint256 cancelDeadline = _startDate - 30 days;
        
        // 創建租約記錄
        rentalRecords[tokenId] = RentalRecord({
            propertyId: _propertyId,
            landlord: property.owner,
            tenant: msg.sender,
            startDate: _startDate,
            endDate: _endDate,
            basePrice: basePrice,
            finalPrice: finalPrice,
            deposit: 0, // 暫不處理房東押金
            discountA: discountA,
            discountBBase: 0, // DeFi收益將通過其他合約處理
            discountBPlus: 0, // DeFi收益將通過其他合約處理
            state: RentalState.Reserved,
            allowTransfer: true,
            cancelDeadline: cancelDeadline,
            metadataURI: ""
        });
        
        // 更新映射
        tenantRentals[msg.sender].push(tokenId);
        propertyToActiveRental[_propertyId] = tokenId;
        _setupRole(TENANT_ROLE, msg.sender);
        
        // 設置NFT元數據URI (實際使用中應該包含租約詳情)
        _setTokenURI(tokenId, property.metadataURI);
        
        emit RentalCreated(tokenId, msg.sender, property.owner, _startDate, _endDate, finalPrice);
        
        // 退還多餘的付款
        if (msg.value > totalPayment) {
            payable(msg.sender).transfer(msg.value - totalPayment);
        }
        
        return tokenId;
    }
    
    /**
     * @dev 取消租約
     * @param _tokenId 租約 NFT 的 tokenId
     */
    function cancelRental(uint256 _tokenId) external nonReentrant {
        RentalRecord storage rental = rentalRecords[_tokenId];
        require(_exists(_tokenId), "Rental does not exist");
        require(rental.state == RentalState.Reserved, "Rental not in reserved state");
        require(msg.sender == rental.tenant || msg.sender == rental.landlord, "Not authorized");
        
        // 計算退款金額 (根據取消政策)
        uint256 refundPercent;
        if (block.timestamp <= rental.cancelDeadline) {
            // 30天前取消
            refundPercent = CANCEL_30_DAYS_REFUND;
        } else if (block.timestamp <= rental.startDate - 7 days) {
            // 7-30天前取消
            refundPercent = CANCEL_7_30_DAYS_REFUND;
        } else if (block.timestamp <= rental.startDate - 1 days) {
            // 1-7天前取消
            refundPercent = CANCEL_1_7_DAYS_REFUND;
        } else {
            // 0-1天前取消
            refundPercent = CANCEL_0_1_DAYS_REFUND;
        }
        
        uint256 refundAmount = (rental.finalPrice * refundPercent) / BASIS_POINTS;
        
        // 退還租金給租客
        payable(rental.tenant).transfer(refundAmount);
        
        // 更新租約狀態
        rental.state = RentalState.Cancelled;
        
        // 釋放物業
        properties[rental.propertyId].available = true;
        
        emit RentalCancelled(_tokenId, msg.sender, refundAmount);
    }
    
    /**
     * @dev 開始租約 (租客入住)
     * @param _tokenId 租約 NFT 的 tokenId
     */
    function startRental(uint256 _tokenId) external {
        require(hasRole(PLATFORM_ROLE, msg.sender), "Only platform can start rental");
        RentalRecord storage rental = rentalRecords[_tokenId];
        require(_exists(_tokenId), "Rental does not exist");
        require(rental.state == RentalState.Reserved, "Rental not in reserved state");
        require(block.timestamp >= rental.startDate, "Rental period not started yet");
        
        rental.state = RentalState.Active;
        emit RentalStateChanged(_tokenId, RentalState.Active);
    }
    
    /**
     * @dev 完成租約 (租期結束)
     * @param _tokenId 租約 NFT 的 tokenId
     */
    function completeRental(uint256 _tokenId) external {
        require(hasRole(PLATFORM_ROLE, msg.sender), "Only platform can complete rental");
        RentalRecord storage rental = rentalRecords[_tokenId];
        require(_exists(_tokenId), "Rental does not exist");
        require(rental.state == RentalState.Active, "Rental not in active state");
        require(block.timestamp >= rental.endDate, "Rental period not ended yet");
        
        rental.state = RentalState.Completed;
        
        // 釋放物業
        properties[rental.propertyId].available = true;
        
        emit RentalCompleted(_tokenId);
    }
    
    /**
     * @dev 報告租約爭議
     * @param _tokenId 租約 NFT 的 tokenId
     */
    function reportDispute(uint256 _tokenId) external {
        RentalRecord storage rental = rentalRecords[_tokenId];
        require(_exists(_tokenId), "Rental does not exist");
        require(msg.sender == rental.tenant || msg.sender == rental.landlord, "Not authorized");
        require(rental.state == RentalState.Reserved || rental.state == RentalState.Active, "Invalid state for dispute");
        
        rental.state = RentalState.Disputed;
        emit RentalDisputed(_tokenId, msg.sender);
    }
    
    /**
     * @dev 轉讓租約給其他租客
     * @param _tokenId 租約 NFT 的 tokenId
     * @param _newTenant 新租客地址
     * @param _price 轉讓價格
     */
    function transferRental(uint256 _tokenId, address _newTenant, uint256 _price) external nonReentrant {
        require(ownerOf(_tokenId) == msg.sender, "Not the owner");
        RentalRecord storage rental = rentalRecords[_tokenId];
        require(rental.allowTransfer, "Transfer not allowed");
        require(rental.state == RentalState.Reserved || rental.state == RentalState.Active, "Invalid state for transfer");
        
        // 計算平台二級市場費用 (2%)
        uint256 platformFee = (_price * 200) / BASIS_POINTS;
        uint256 sellerAmount = _price - platformFee;
        
        // 接收付款 (此處簡化，實際實現需要更複雜的付款處理)
        require(msg.value >= _price, "Insufficient payment");
        
        // 轉發賣家款項
        payable(msg.sender).transfer(sellerAmount);
        
        // 更新租約信息
        rental.tenant = _newTenant;
        
        // 轉移NFT所有權
        _transfer(msg.sender, _newTenant, _tokenId);
        
        // 更新租客映射
        tenantRentals[_newTenant].push(_tokenId);
        
        // 清理原租客的記錄 (實際實現應更高效)
        uint256[] storage originalTenantRentals = tenantRentals[msg.sender];
        for (uint256 i = 0; i < originalTenantRentals.length; i++) {
            if (originalTenantRentals[i] == _tokenId) {
                originalTenantRentals[i] = originalTenantRentals[originalTenantRentals.length - 1];
                originalTenantRentals.pop();
                break;
            }
        }
        
        _setupRole(TENANT_ROLE, _newTenant);
        
        emit RentalTransferred(_tokenId, msg.sender, _newTenant, _price);
    }
    
    /**
     * @dev 更新租約元數據URI
     * @param _tokenId 租約 NFT 的 tokenId
     * @param _metadataURI 新的元數據URI
     */
    function updateRentalMetadata(uint256 _tokenId, string memory _metadataURI) external {
        require(hasRole(PLATFORM_ROLE, msg.sender), "Only platform can update metadata");
        require(_exists(_tokenId), "Rental does not exist");
        
        rentalRecords[_tokenId].metadataURI = _metadataURI;
        _setTokenURI(_tokenId, _metadataURI);
    }
    
    /**
     * @dev 獲取租客的所有租約
     * @param _tenant 租客地址
     * @return 租約ID數組
     */
    function getTenantRentals(address _tenant) external view returns (uint256[] memory) {
        return tenantRentals[_tenant];
    }
    
    /**
     * @dev 獲取房東的所有物業
     * @param _landlord 房東地址
     * @return 物業ID數組
     */
    function getLandlordProperties(address _landlord) external view returns (uint256[] memory) {
        return landlordProperties[_landlord];
    }
    
    /**
     * @dev 實現 ERC721 的合約級支持接口查詢
     * @param interfaceId 接口ID
     * @return 是否支持
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}