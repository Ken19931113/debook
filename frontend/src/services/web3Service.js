import { ethers } from 'ethers';
import RentalNFT from '../contracts/RentalNFT.json';
import DeFiIntegration from '../contracts/DeFiIntegration.json';
import Escrow from '../contracts/Escrow.json';
import Governance from '../contracts/Governance.json';

// 合約地址 (應從環境變數或配置文件中獲取)
const CONTRACT_ADDRESSES = {
  RENTAL_NFT: process.env.REACT_APP_RENTAL_NFT_ADDRESS || '0x123...',
  DEFI_INTEGRATION: process.env.REACT_APP_DEFI_INTEGRATION_ADDRESS || '0x456...',
  ESCROW: process.env.REACT_APP_ESCROW_ADDRESS || '0x789...',
  GOVERNANCE: process.env.REACT_APP_GOVERNANCE_ADDRESS || '0xabc...',
  STABLECOIN: process.env.REACT_APP_STABLECOIN_ADDRESS || '0xdef...',
};

/**
 * Web3 服務類，用於與區塊鏈合約交互
 */
class Web3Service {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contracts = {};
    this.account = null;
    this.networkId = null;
    this.isInitialized = false;
  }

  /**
   * 初始化 Web3 連接
   * @param {Object} provider 以太坊提供者
   * @param {Object} signer 簽名者
   * @param {string} account 用戶地址
   */
  async init(provider, signer, account) {
    try {
      this.provider = provider;
      this.signer = signer;
      this.account = account;
      
      if (!provider) {
        throw new Error('Provider is required');
      }
      
      // 獲取網絡ID
      const network = await provider.getNetwork();
      this.networkId = network.chainId;
      
      // 初始化合約實例
      await this._initContracts();
      
      this.isInitialized = true;
      console.log('Web3Service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Web3Service:', error);
      this.isInitialized = false;
      return false;
    }
  }
  
  /**
   * 初始化合約實例
   * @private
   */
  async _initContracts() {
    // 使用只讀提供者的合約實例
    this.contracts.rentalNFT = new ethers.Contract(
      CONTRACT_ADDRESSES.RENTAL_NFT,
      RentalNFT.abi,
      this.provider
    );
    
    this.contracts.defiIntegration = new ethers.Contract(
      CONTRACT_ADDRESSES.DEFI_INTEGRATION,
      DeFiIntegration.abi,
      this.provider
    );
    
    this.contracts.escrow = new ethers.Contract(
      CONTRACT_ADDRESSES.ESCROW,
      Escrow.abi,
      this.provider
    );
    
    this.contracts.governance = new ethers.Contract(
      CONTRACT_ADDRESSES.GOVERNANCE,
      Governance.abi,
      this.provider
    );
    
    // 如果有簽名者，則創建可寫的合約實例
    if (this.signer) {
      this.contracts.writableRentalNFT = new ethers.Contract(
        CONTRACT_ADDRESSES.RENTAL_NFT,
        RentalNFT.abi,
        this.signer
      );
      
      this.contracts.writableDefiIntegration = new ethers.Contract(
        CONTRACT_ADDRESSES.DEFI_INTEGRATION,
        DeFiIntegration.abi,
        this.signer
      );
      
      this.contracts.writableEscrow = new ethers.Contract(
        CONTRACT_ADDRESSES.ESCROW,
        Escrow.abi,
        this.signer
      );
      
      this.contracts.writableGovernance = new ethers.Contract(
        CONTRACT_ADDRESSES.GOVERNANCE,
        Governance.abi,
        this.signer
      );
    }
  }
  
  /**
   * 檢查是否已初始化
   */
  checkInitialized() {
    if (!this.isInitialized) {
      throw new Error('Web3Service not initialized');
    }
  }
  
  /**
   * 獲取可用的房源
   * @returns {Promise<Array>} 房源列表
   */
  async getAvailableProperties() {
    this.checkInitialized();
    
    try {
      // 獲取最新的物業ID
      const propertyCount = await this.contracts.rentalNFT.getPropertyCount();
      
      // 獲取所有可用的物業
      const propertiesList = [];
      for (let i = 1; i <= propertyCount.toNumber(); i++) {
        const property = await this.contracts.rentalNFT.properties(i);
        if (property.available) {
          // 獲取物業元數據 (簡化版本，實際應從IPFS或API獲取)
          const metadata = { 
            name: `Property #${i}`,
            description: `Located at ${property.location}`,
            image: `https://via.placeholder.com/400x300?text=Property+${i}`
          };
          
          propertiesList.push({
            id: i,
            owner: property.owner,
            location: property.location,
            pricePerMonth: ethers.utils.formatEther(property.pricePerMonth),
            minRentalDuration: property.minRentalDuration.toNumber(),
            maxRentalDuration: property.maxRentalDuration.toNumber(),
            depositRequirement: property.depositRequirement.toNumber(),
            metadata
          });
        }
      }
      
      return propertiesList;
    } catch (error) {
      console.error('Failed to get available properties:', error);
      throw error;
    }
  }
  
  /**
   * 計算租金和折扣
   * @param {number} propertyId 物業ID
   * @param {number} startTimestamp 開始時間戳
   * @param {number} endTimestamp 結束時間戳
   * @param {number} advanceBookingDays 提前預訂天數
   * @returns {Promise<Object>} 租金計算結果
   */
  async calculateRentalPrice(propertyId, startTimestamp, endTimestamp, advanceBookingDays) {
    this.checkInitialized();
    
    try {
      const [basePrice, discountA, finalPrice] = await this.contracts.rentalNFT.calculateRentalPrice(
        propertyId,
        startTimestamp,
        endTimestamp,
        advanceBookingDays
      );
      
      // 計算平台費 (3%)
      const platformFee = finalPrice.mul(300).div(10000);
      const totalPayment = finalPrice.add(platformFee);
      
      return {
        basePrice: ethers.utils.formatEther(basePrice),
        discountA: ethers.utils.formatEther(discountA),
        finalPrice: ethers.utils.formatEther(finalPrice),
        platformFee: ethers.utils.formatEther(platformFee),
        totalPayment: ethers.utils.formatEther(totalPayment),
        // 計算預期DeFi收益折扣 (僅用於UI顯示)
        estimatedDiscountB: parseFloat(ethers.utils.formatEther(basePrice)) * 0.04 * 0.7, // 4% APY * 70% 租客分成
        rawValues: {
          basePrice,
          discountA,
          finalPrice,
          platformFee,
          totalPayment
        }
      };
    } catch (error) {
      console.error('Failed to calculate rental price:', error);
      throw error;
    }
  }
  
  /**
   * 創建租約
   * @param {number} propertyId 物業ID
   * @param {number} startTimestamp 開始時間戳
   * @param {number} endTimestamp 結束時間戳
   * @param {string} strategy DeFi策略
   * @returns {Promise<Object>} 交易結果
   */
  async createRental(propertyId, startTimestamp, endTimestamp, strategy) {
    this.checkInitialized();
    
    if (!this.signer) {
      throw new Error('Signer is required');
    }
    
    try {
      // 計算提前預訂天數
      const now = Math.floor(Date.now() / 1000);
      const advanceBookingDays = Math.floor((startTimestamp - now) / 86400);
      
      // 獲取價格計算
      const priceCalc = await this.calculateRentalPrice(
        propertyId,
        startTimestamp,
        endTimestamp,
        advanceBookingDays
      );
      
      // 執行預訂交易
      const tx = await this.contracts.writableRentalNFT.createRental(
        propertyId,
        startTimestamp,
        endTimestamp,
        { value: priceCalc.rawValues.totalPayment }
      );
      
      // 等待交易確認
      const receipt = await tx.wait();
      
      // 解析事件以獲取租約ID
      const event = receipt.events.find(e => e.event === 'RentalCreated');
      const rentalId = event.args.tokenId.toNumber();
      
      // 獲取創建的租約信息
      const rental = await this.contracts.rentalNFT.rentalRecords(rentalId);
      
      return {
        success: true,
        rentalId,
        rental,
        transaction: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        }
      };
    } catch (error) {
      console.error('Failed to create rental:', error);
      throw error;
    }
  }
  
  /**
   * 獲取用戶的租約
   * @returns {Promise<Array>} 租約列表
   */
  async getUserRentals() {
    this.checkInitialized();
    
    if (!this.account) {
      throw new Error('User account is required');
    }
    
    try {
      const tenantRentals = await this.contracts.rentalNFT.getTenantRentals(this.account);
      
      const rentalsDetails = await Promise.all(
        tenantRentals.map(async (rentalId) => {
          const rental = await this.contracts.rentalNFT.rentalRecords(rentalId);
          
          // 獲取關聯的物業
          const property = await this.contracts.rentalNFT.properties(rental.propertyId);
          
          // 獲取相關的DeFi收益數據 (如果有)
          let yieldData = { baseYield: 0, plusYield: 0 };
          try {
            if (this.contracts.defiIntegration) {
              const [baseYield, plusYield] = await this.contracts.defiIntegration.estimateCurrentYield(rentalId);
              yieldData = {
                baseYield: ethers.utils.formatEther(baseYield),
                plusYield: ethers.utils.formatEther(plusYield)
              };
            }
          } catch (err) {
            console.warn('Failed to get yield data:', err);
          }
          
          return {
            id: rentalId.toNumber(),
            propertyId: rental.propertyId.toNumber(),
            startDate: new Date(rental.startDate.toNumber() * 1000).toLocaleDateString(),
            endDate: new Date(rental.endDate.toNumber() * 1000).toLocaleDateString(),
            startTimestamp: rental.startDate.toNumber(),
            endTimestamp: rental.endDate.toNumber(),
            basePrice: ethers.utils.formatEther(rental.basePrice),
            finalPrice: ethers.utils.formatEther(rental.finalPrice),
            discountA: ethers.utils.formatEther(rental.discountA),
            state: rental.state,
            stateName: this._getRentalStateName(rental.state),
            allowTransfer: rental.allowTransfer,
            property: {
              location: property.location,
              pricePerMonth: ethers.utils.formatEther(property.pricePerMonth)
            },
            yield: yieldData
          };
        })
      );
      
      return rentalsDetails;
    } catch (error) {
      console.error('Failed to get user rentals:', error);
      throw error;
    }
  }
  
  /**
   * 取消租約
   * @param {number} rentalId 租約ID
   * @returns {Promise<Object>} 交易結果
   */
  async cancelRental(rentalId) {
    this.checkInitialized();
    
    if (!this.signer) {
      throw new Error('Signer is required');
    }
    
    try {
      const tx = await this.contracts.writableRentalNFT.cancelRental(rentalId);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transaction: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        }
      };
    } catch (error) {
      console.error('Failed to cancel rental:', error);
      throw error;
    }
  }
  
  /**
   * 轉移租約
   * @param {number} rentalId 租約ID
   * @param {string} newTenant 新租客地址
   * @param {string} price 轉讓價格
   * @returns {Promise<Object>} 交易結果
   */
  async transferRental(rentalId, newTenant, price) {
    this.checkInitialized();
    
    if (!this.signer) {
      throw new Error('Signer is required');
    }
    
    try {
      // 將價格轉換為 Wei
      const priceInWei = ethers.utils.parseEther(price.toString());
      
      const tx = await this.contracts.writableRentalNFT.transferRental(
        rentalId,
        newTenant,
        priceInWei,
        { value: priceInWei } // 支付轉讓費用
      );
      
      const receipt = await tx.wait();
      
      return {
        success: true,
        transaction: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        }
      };
    } catch (error) {
      console.error('Failed to transfer rental:', error);
      throw error;
    }
  }
  
  /**
   * 列出新物業
   * @param {Object} propertyData 物業數據
   * @returns {Promise<Object>} 交易結果
   */
  async listProperty(propertyData) {
    this.checkInitialized();
    
    if (!this.signer) {
      throw new Error('Signer is required');
    }
    
    try {
      const {
        location,
        pricePerMonth,
        minRentalDuration,
        maxRentalDuration,
        depositRequirement,
        metadataURI
      } = propertyData;
      
      // 將價格轉換為 Wei
      const priceInWei = ethers.utils.parseEther(pricePerMonth.toString());
      
      const tx = await this.contracts.writableRentalNFT.listProperty(
        location,
        priceInWei,
        minRentalDuration,
        maxRentalDuration,
        depositRequirement,
        metadataURI || ''
      );
      
      const receipt = await tx.wait();
      
      // 解析事件以獲取物業ID
      const event = receipt.events.find(e => e.event === 'PropertyListed');
      const propertyId = event.args.propertyId.toNumber();
      
      return {
        success: true,
        propertyId,
        transaction: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        }
      };
    } catch (error) {
      console.error('Failed to list property:', error);
      throw error;
    }
  }
  
  /**
   * 獲取租約狀態名稱
   * @param {number} stateId 狀態ID
   * @returns {string} 狀態名稱
   * @private
   */
  _getRentalStateName(stateId) {
    const stateNames = [
      'Available',
      'Reserved',
      'Active',
      'Completed',
      'Cancelled',
      'Disputed'
    ];
    
    return stateNames[stateId] || 'Unknown';
  }
}

// 創建單例實例
const web3Service = new Web3Service();

export default web3Service;