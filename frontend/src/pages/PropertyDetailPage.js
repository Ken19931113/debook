import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import web3Service from '../services/web3Service';

const PropertyDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // 預訂表單狀態
  const [bookingForm, setBookingForm] = useState({
    startDate: '',
    endDate: '',
    strategy: 'conservative' // 默認策略
  });
  
  // 價格計算結果
  const [priceCalculation, setPriceCalculation] = useState(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  
  // 提交狀態
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  
  // 加載物業數據
  useEffect(() => {
    const fetchProperty = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 通過 ID 獲取物業
        const propertyData = await web3Service.getProperty(id);
        
        if (!propertyData) {
          throw new Error('Property not found');
        }
        
        setProperty(propertyData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching property:', err);
        setError('Failed to load property. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchProperty();
  }, [id]);
  
  // 處理表單變化
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setBookingForm(prev => ({ ...prev, [name]: value }));
    
    // 重置價格計算
    setPriceCalculation(null);
  };
  
  // 計算價格
  const calculatePrice = async () => {
    if (!bookingForm.startDate || !bookingForm.endDate) {
      return;
    }
    
    try {
      setCalculatingPrice(true);
      
      // 轉換日期為時間戳
      const startTimestamp = Math.floor(new Date(bookingForm.startDate).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(bookingForm.endDate).getTime() / 1000);
      
      // 計算提前預訂天數
      const now = Math.floor(Date.now() / 1000);
      const advanceBookingDays = Math.floor((startTimestamp - now) / 86400);
      
      // 獲取價格計算
      const priceCalc = await web3Service.calculateRentalPrice(
        id,
        startTimestamp,
        endTimestamp,
        advanceBookingDays
      );
      
      setPriceCalculation(priceCalc);
      setCalculatingPrice(false);
    } catch (err) {
      console.error('Error calculating price:', err);
      setError('Failed to calculate price. Please try again.');
      setCalculatingPrice(false);
    }
  };
  
  // 提交預訂
  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      setError('Please connect your wallet to book a property');
      return;
    }
    
    if (!bookingForm.startDate || !bookingForm.endDate) {
      setError('Please select both start and end dates');
      return;
    }
    
    try {
      setSubmitting(true);
      setError(null);
      
      // 轉換日期為時間戳
      const startTimestamp = Math.floor(new Date(bookingForm.startDate).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(bookingForm.endDate).getTime() / 1000);
      
      // 創建租約
      const result = await web3Service.createRental(
        id,
        startTimestamp,
        endTimestamp,
        bookingForm.strategy
      );
      
      if (result.success) {
        setBookingSuccess(true);
        setBookingResult(result);
        
        // 重置表單
        setBookingForm({
          startDate: '',
          endDate: '',
          strategy: 'conservative'
        });
        
        setPriceCalculation(null);
      } else {
        throw new Error(result.error || 'Failed to create rental');
      }
      
      setSubmitting(false);
    } catch (err) {
      console.error('Error creating rental:', err);
      setError(err.message || 'Failed to create rental. Please try again.');
      setSubmitting(false);
    }
  };
  
  // 連接錢包
  const handleConnect = () => {
    // 觸發 Web3Modal
    document.querySelector('w3m-button')?.click();
  };
  
  // 渲染物業詳情
  const renderPropertyDetails = () => {
    if (!property) return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 左側：物業圖片和詳情 */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <img 
              src={property.metadata?.image || `https://via.placeholder.com/800x400?text=${encodeURIComponent(property.metadata?.name || `Property #${property.id}`)}`}
              alt={property.metadata?.name || `Property #${property.id}`}
              className="w-full h-64 object-cover"
            />
            
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-2">{property.metadata?.name || `Property #${property.id}`}</h1>
              <p className="text-gray-600 mb-4">{property.location}</p>
              
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                  </svg>
                  <span>{property.metadata?.bedrooms || 0} Beds</span>
                </div>
                
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.5 2a3.5 3.5 0 101.665 6.58L8.585 10l-1.42 1.42a3.5 3.5 0 101.414 1.414L10 11.414l1.42 1.42a3.5 3.5 0 101.414-1.414L11.414 10l1.42-1.42A3.5 3.5 0 1011.17 7H8.83a3.5 3.5 0 00-3.33-5z" clipRule="evenodd" />
                  </svg>
                  <span>{property.metadata?.bathrooms || 0} Baths</span>
                </div>
                
                {property.metadata?.squareMeters && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 4a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1H5zm12 7a1 1 0 01-1 1h-3v3a1 1 0 11-2 0v-3H8a1 1 0 110-2h3V7a1 1 0 112 0v3h3a1 1 0 011 1z" clipRule="evenodd" />
                    </svg>
                    <span>{property.metadata.squareMeters} m²</span>
                  </div>
                )}
              </div>
              
              <div className="border-t border-b border-gray-200 py-4 my-4">
                <p className="text-xl font-bold text-blue-600">{property.pricePerMonth} USDC <span className="text-gray-500 text-base font-normal">/ month</span></p>
                <p className="text-sm text-gray-500">
                  Rental Duration: {property.minRentalDuration} - {property.maxRentalDuration} months
                </p>
              </div>
              
              <h2 className="text-xl font-bold mt-6 mb-3">Description</h2>
              <p className="text-gray-700 mb-6">{property.metadata?.description || 'No description available.'}</p>
              
              {property.metadata?.amenities && property.metadata.amenities.length > 0 && (
                <>
                  <h2 className="text-xl font-bold mt-6 mb-3">Amenities</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {property.metadata.amenities.map(amenity => (
                      <div key={amenity} className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>{amenity}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              <div className="mt-8">
                <h2 className="text-xl font-bold mb-3">Owner</h2>
                <div className="flex items-center">
                  <div className="bg-blue-100 text-blue-800 rounded-full w-10 h-10 flex items-center justify-center mr-3">
                    {property.owner.substring(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm">
                      {property.owner.substring(0, 6)}...{property.owner.substring(property.owner.length - 4)}
                    </p>
                    <a 
                      href={`https://mumbai.polygonscan.com/address/${property.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View on Polygonscan
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 右側：預訂表單 */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
            <h2 className="text-xl font-bold mb-4">Book This Property</h2>
            
            {!isConnected ? (
              <div className="text-center py-6">
                <p className="text-gray-600 mb-4">Connect your wallet to book this property</p>
                <button 
                  onClick={handleConnect}
                  className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition w-full"
                >
                  Connect Wallet
                </button>
              </div>
            ) : bookingSuccess ? (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                <h3 className="font-bold">Booking Successful!</h3>
                <p>Your rental has been created with ID: {bookingResult.rentalId}</p>
                <p className="text-sm mt-2">
                  Transaction Hash: <a 
                    href={`https://mumbai.polygonscan.com/tx/${bookingResult.transaction.hash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {bookingResult.transaction.hash.substring(0, 10)}...
                  </a>
                </p>
                <div className="mt-4">
                  <button
                    className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition w-full"
                    onClick={() => navigate(`/dashboard`)}
                  >
                    View Your Rentals
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitBooking}>
                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                    {error}
                  </div>
                )}
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Check In Date
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={bookingForm.startDate}
                    onChange={handleInputChange}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Check Out Date
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    value={bookingForm.endDate}
                    onChange={handleInputChange}
                    min={bookingForm.startDate || new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    DeFi Strategy
                  </label>
                  <select
                    name="strategy"
                    value={bookingForm.strategy}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="conservative">Conservative (3-5% APY)</option>
                    <option value="balanced">Balanced (8-10% APY)</option>
                    <option value="growth">Growth (10-15% APY)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Higher yield strategies may provide larger discounts but come with increased risk.
                  </p>
                </div>
                
                {!priceCalculation ? (
                  <button
                    type="button"
                    onClick={calculatePrice}
                    disabled={!bookingForm.startDate || !bookingForm.endDate || calculatingPrice}
                    className="w-full bg-gray-600 text-white py-2 rounded-md hover:bg-gray-700 transition disabled:opacity-50 mb-4"
                  >
                    {calculatingPrice ? 'Calculating...' : 'Calculate Price'}
                  </button>
                ) : (
                  <div className="border rounded-md p-3 bg-gray-50 mb-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-2">Price Breakdown</h3>
                    
                    <div className="text-sm">
                      <div className="flex justify-between mb-1">
                        <span>Base Price:</span>
                        <span>{priceCalculation.basePrice} USDC</span>
                      </div>
                      
                      <div className="flex justify-between mb-1 text-green-600">
                        <span>Early Booking Discount:</span>
                        <span>-{priceCalculation.discountA} USDC</span>
                      </div>
                      
                      <div className="flex justify-between mb-1 text-green-600">
                        <span>Est. DeFi Earnings:</span>
                        <span>-{priceCalculation.estimatedDiscountB.toFixed(2)} USDC</span>
                      </div>
                      
                      <div className="flex justify-between mb-1 pt-1 border-t">
                        <span>Subtotal:</span>
                        <span>{priceCalculation.finalPrice} USDC</span>
                      </div>
                      
                      <div className="flex justify-between mb-1">
                        <span>Platform Fee (3%):</span>
                        <span>{priceCalculation.platformFee} USDC</span>
                      </div>
                      
                      <div className="flex justify-between font-bold pt-1 border-t">
                        <span>Total:</span>
                        <span>{priceCalculation.totalPayment} USDC</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={!priceCalculation || submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Book Now'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading property details...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <div className="mt-4">
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
            >
              Back to Properties
            </button>
          </div>
        </div>
      ) : (
        renderPropertyDetails()
      )}
    </div>
  );
};

export default PropertyDetailPage;