import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount, useProvider, useSigner } from 'wagmi';
import RentalNFT from '../contracts/RentalNFT.json';
import DeFiIntegration from '../contracts/DeFiIntegration.json';

// 合約地址 (後續會從配置中獲取)
const RENTAL_NFT_ADDRESS = '0x123...'; // 替換為實際部署的合約地址
const DEFI_INTEGRATION_ADDRESS = '0x456...'; // 替換為實際部署的合約地址

const PropertyListing = () => {
  const [properties, setProperties] = useState([]);
  const [myRentals, setMyRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // 用戶選擇的篩選條件
  const [filters, setFilters] = useState({
    minPrice: 0,
    maxPrice: 10000,
    minDuration: 1,
    maxDuration: 12,
    location: ''
  });
  
  // 預訂表單狀態
  const [bookingForm, setBookingForm] = useState({
    propertyId: null,
    startDate: '',
    endDate: '',
    strategy: 'conservative' // 默認策略
  });
  
  // 用戶的錢包信息
  const { address, isConnected } = useAccount();
  const provider = useProvider();
  const { data: signer } = useSigner();
  
  // 初始化合約實例
  useEffect(() => {
    const fetchProperties = async () => {
      if (!isConnected || !provider) return;
      
      try {
        setLoading(true);
        
        // 初始化合約
        const rentalContract = new ethers.Contract(
          RENTAL_NFT_ADDRESS,
          RentalNFT.abi,
          provider
        );
        
        // 獲取最新的物業ID (這需要根據您的合約設計調整)
        const propertyCount = await rentalContract.getPropertyCount();
        
        // 獲取所有可用的物業
        const propertiesList = [];
        for (let i = 1; i <= propertyCount; i++) {
          const property = await rentalContract.properties(i);
          if (property.available) {
            // 獲取物業元數據 (可能需要從IPFS或後端API獲取)
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
        
        setProperties(propertiesList);
        
        // 如果用戶已連接錢包，獲取他們的租約
        if (address) {
          const tenantRentals = await rentalContract.getTenantRentals(address);
          
          const rentalsDetails = await Promise.all(
            tenantRentals.map(async (rentalId) => {
              const rental = await rentalContract.rentalRecords(rentalId);
              return {
                id: rentalId.toNumber(),
                propertyId: rental.propertyId.toNumber(),
                startDate: new Date(rental.startDate.toNumber() * 1000).toLocaleDateString(),
                endDate: new Date(rental.endDate.toNumber() * 1000).toLocaleDateString(),
                basePrice: ethers.utils.formatEther(rental.basePrice),
                finalPrice: ethers.utils.formatEther(rental.finalPrice),
                state: rental.state
              };
            })
          );
          
          setMyRentals(rentalsDetails);
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error fetching properties:", err);
        setError("Failed to load properties. Please try again later.");
        setLoading(false);
      }
    };
    
    fetchProperties();
  }, [provider, address, isConnected]);
  
  // 處理篩選條件變化
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // 篩選物業
  const filteredProperties = properties.filter(property => {
    const price = parseFloat(property.pricePerMonth);
    return (
      price >= filters.minPrice &&
      price <= filters.maxPrice &&
      property.minRentalDuration >= filters.minDuration &&
      property.maxRentalDuration <= filters.maxDuration &&
      (filters.location === '' || property.location.includes(filters.location))
    );
  });
  
  // 處理預訂表單變化
  const handleBookingChange = (e) => {
    const { name, value } = e.target;
    setBookingForm(prev => ({ ...prev, [name]: value }));
  };
  
  // 處理選擇物業進行預訂
  const handleSelectProperty = (propertyId) => {
    setBookingForm(prev => ({ ...prev, propertyId }));
    
    // 捲動到預訂表單
    document.getElementById('booking-form').scrollIntoView({ behavior: 'smooth' });
  };
  
  // 處理提交預訂
  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    
    if (!isConnected || !signer) {
      setError("Please connect your wallet to book a property");
      return;
    }
    
    try {
      setLoading(true);
      
      const { propertyId, startDate, endDate, strategy } = bookingForm;
      
      // 驗證輸入
      if (!propertyId || !startDate || !endDate) {
        setError("Please fill in all required fields");
        setLoading(false);
        return;
      }
      
      // 轉換日期為時間戳
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
      
      // 獲取物業詳情
      const selectedProperty = properties.find(p => p.id === propertyId);
      
      // 計算價格和折扣
      const rentalContract = new ethers.Contract(
        RENTAL_NFT_ADDRESS,
        RentalNFT.abi,
        signer
      );
      
      // 計算提前預訂天數
      const now = Math.floor(Date.now() / 1000);
      const advanceBookingDays = Math.floor((startTimestamp - now) / 86400);
      
      // 獲取價格計算
      const [basePrice, discountA, finalPrice] = await rentalContract.calculateRentalPrice(
        propertyId,
        startTimestamp,
        endTimestamp,
        advanceBookingDays
      );
      
      // 計算平台費 (3%)
      const platformFee = finalPrice.mul(300).div(10000);
      const totalPayment = finalPrice.add(platformFee);
      
      // 執行預訂交易
      const tx = await rentalContract.createRental(
        propertyId,
        startTimestamp,
        endTimestamp,
        { value: totalPayment }
      );
      
      await tx.wait();
      
      // 重新加載數據
      window.location.reload();
      
    } catch (err) {
      console.error("Error booking property:", err);
      setError(err.message || "Failed to book property. Please try again.");
      setLoading(false);
    }
  };
  
  // 處理取消租約
  const handleCancelRental = async (rentalId) => {
    if (!isConnected || !signer) {
      setError("Please connect your wallet to cancel a rental");
      return;
    }
    
    try {
      setLoading(true);
      
      const rentalContract = new ethers.Contract(
        RENTAL_NFT_ADDRESS,
        RentalNFT.abi,
        signer
      );
      
      const tx = await rentalContract.cancelRental(rentalId);
      await tx.wait();
      
      // 重新加載數據
      window.location.reload();
      
    } catch (err) {
      console.error("Error cancelling rental:", err);
      setError(err.message || "Failed to cancel rental. Please try again.");
      setLoading(false);
    }
  };
  
  // 處理轉移租約
  const handleTransferRental = async (rentalId) => {
    // 此處實現轉移租約的邏輯
    // 需要彈出模態框收集接收方地址和轉移價格
    alert("Transfer functionality will be implemented in the next version");
  };
  
  // 渲染物業卡片
  const renderPropertyCard = (property) => (
    <div key={property.id} className="border rounded-lg p-4 shadow-sm hover:shadow-md transition">
      <img 
        src={property.metadata.image} 
        alt={property.metadata.name}
        className="w-full h-48 object-cover rounded-md mb-3"
      />
      <h3 className="text-lg font-semibold">{property.metadata.name}</h3>
      <p className="text-gray-600 mb-2">{property.location}</p>
      <p className="font-medium">{property.pricePerMonth} USDC / month</p>
      <p className="text-sm text-gray-500">
        Duration: {property.minRentalDuration} - {property.maxRentalDuration} months
      </p>
      <button
        onClick={() => handleSelectProperty(property.id)}
        className="mt-3 w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition"
      >
        Book Now
      </button>
    </div>
  );
  
  // 渲染預訂表單
  const renderBookingForm = () => {
    const selectedProperty = properties.find(p => p.id === bookingForm.propertyId);
    
    if (!bookingForm.propertyId || !selectedProperty) {
      return null;
    }
    
    return (
      <div id="booking-form" className="mt-8 p-6 border rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">Book {selectedProperty.metadata.name}</h2>
        
        <form onSubmit={handleSubmitBooking} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              type="date"
              name="startDate"
              value={bookingForm.startDate}
              onChange={handleBookingChange}
              min={new Date().toISOString().split('T')[0]}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              type="date"
              name="endDate"
              value={bookingForm.endDate}
              onChange={handleBookingChange}
              min={bookingForm.startDate || new Date().toISOString().split('T')[0]}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">DeFi Strategy</label>
            <select
              name="strategy"
              value={bookingForm.strategy}
              onChange={handleBookingChange}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            >
              <option value="conservative">Conservative (3-5% APY)</option>
              <option value="balanced">Balanced (8-10% APY)</option>
              <option value="growth">Growth (10-15% APY)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Higher yield strategies may provide larger discounts but come with increased risk.
            </p>
          </div>
          
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    );
  };
  
  // 渲染我的租約
  const renderMyRentals = () => {
    if (!isConnected) {
      return (
        <div className="text-center p-6 bg-gray-50 rounded-lg">
          <p>Connect your wallet to view your rentals</p>
        </div>
      );
    }
    
    if (myRentals.length === 0) {
      return (
        <div className="text-center p-6 bg-gray-50 rounded-lg">
          <p>You don't have any active rentals</p>
        </div>
      );
    }
    
    // 定義狀態名稱映射
    const stateNames = [
      'Available',
      'Reserved',
      'Active',
      'Completed',
      'Cancelled',
      'Disputed'
    ];
    
    return (
      <div className="space-y-4">
        {myRentals.map(rental => (
          <div key={rental.id} className="border rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">Rental #{rental.id}</h3>
                <p className="text-gray-600">Property #{rental.propertyId}</p>
                <p className="text-sm">{rental.startDate} - {rental.endDate}</p>
                <p className="mt-2">
                  <span className="font-medium">Paid: </span>
                  {rental.finalPrice} USDC
                </p>
                <p className="text-sm text-gray-500">
                  <span className="font-medium">Status: </span>
                  {stateNames[rental.state] || 'Unknown'}
                </p>
              </div>
              
              <div className="space-y-2">
                {(rental.state === 1) && ( // Reserved
                  <button
                    onClick={() => handleCancelRental(rental.id)}
                    className="block w-full bg-red-600 text-white py-1 px-3 rounded-md hover:bg-red-700 transition text-sm"
                  >
                    Cancel
                  </button>
                )}
                
                {(rental.state === 1 || rental.state === 2) && ( // Reserved or Active
                  <button
                    onClick={() => handleTransferRental(rental.id)}
                    className="block w-full bg-purple-600 text-white py-1 px-3 rounded-md hover:bg-purple-700 transition text-sm"
                  >
                    Transfer
                  </button>
                )}
                
                <button
                  onClick={() => alert(`Viewing NFT #${rental.id} details`)}
                  className="block w-full bg-gray-600 text-white py-1 px-3 rounded-md hover:bg-gray-700 transition text-sm"
                >
                  View NFT
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 篩選面板 */}
        <div className="md:col-span-1">
          <div className="sticky top-6 border rounded-lg p-4 shadow-sm">
            <h2 className="text-xl font-bold mb-4">Filters</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Price Range (USDC)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    type="number"
                    name="minPrice"
                    placeholder="Min"
                    value={filters.minPrice}
                    onChange={handleFilterChange}
                    className="border border-gray-300 rounded-md p-2"
                  />
                  <input
                    type="number"
                    name="maxPrice"
                    placeholder="Max"
                    value={filters.maxPrice}
                    onChange={handleFilterChange}
                    className="border border-gray-300 rounded-md p-2"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Duration (months)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    type="number"
                    name="minDuration"
                    placeholder="Min"
                    value={filters.minDuration}
                    onChange={handleFilterChange}
                    className="border border-gray-300 rounded-md p-2"
                  />
                  <input
                    type="number"
                    name="maxDuration"
                    placeholder="Max"
                    value={filters.maxDuration}
                    onChange={handleFilterChange}
                    className="border border-gray-300 rounded-md p-2"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input
                  type="text"
                  name="location"
                  placeholder="Enter location..."
                  value={filters.location}
                  onChange={handleFilterChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                />
              </div>
            </div>
          </div>
          
          {/* 我的租約部分 */}
          <div className="mt-8 border rounded-lg p-4 shadow-sm">
            <h2 className="text-xl font-bold mb-4">My Rentals</h2>
            {renderMyRentals()}
          </div>
        </div>
        
        {/* 主要內容區 */}
        <div className="md:col-span-2">
          <h1 className="text-3xl font-bold mb-6">Available Properties</h1>
          
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading properties...</p>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No properties found matching your criteria</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredProperties.map(renderPropertyCard)}
            </div>
          )}
          
          {/* 預訂表單 */}
          {renderBookingForm()}
        </div>
      </div>
    </div>
  );
};

export default PropertyListing;