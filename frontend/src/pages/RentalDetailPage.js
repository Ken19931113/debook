import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import web3Service from '../services/web3Service';

const RentalDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  
  const [rental, setRental] = useState(null);
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    address: '',
    price: ''
  });
  
  // 載入租約數據
  useEffect(() => {
    const fetchRentalDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (!isConnected) {
          setError('Please connect your wallet to view rental details');
          setLoading(false);
          return;
        }
        
        // 通過 ID 獲取租約
        const rentalData = await web3Service.getRental(id);
        
        if (!rentalData) {
          throw new Error('Rental not found');
        }
        
        setRental(rentalData);
        
        // 獲取關聯的物業
        const propertyData = await web3Service.getProperty(rentalData.propertyId);
        setProperty(propertyData);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching rental details:', err);
        setError('Failed to load rental details. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchRentalDetails();
  }, [id, isConnected]);
  
  // 處理取消租約
  const handleCancelRental = async () => {
    if (!isConnected || !rental) {
      return;
    }
    
    // 只有待進行的租約才能取消
    if (rental.state !== 1) {
      setActionError('Only reserved rentals can be cancelled');
      return;
    }
    
    try {
      setActionLoading(true);
      setActionError(null);
      
      const result = await web3Service.cancelRental(id);
      
      if (result.success) {
        // 重新載入租約
        const updatedRental = await web3Service.getRental(id);
        setRental(updatedRental);
      } else {
        throw new Error(result.error || 'Failed to cancel rental');
      }
      
      setActionLoading(false);
    } catch (err) {
      console.error('Error cancelling rental:', err);
      setActionError(err.message || 'Failed to cancel rental. Please try again.');
      setActionLoading(false);
    }
  };
  
  // 處理轉讓表單變化
  const handleTransferChange = (e) => {
    const { name, value } = e.target;
    setTransferForm(prev => ({ ...prev, [name]: value }));
  };
  
  // 處理轉讓租約
  const handleTransferRental = async (e) => {
    e.preventDefault();
    
    if (!isConnected || !rental) {
      return;
    }
    
    // 驗證轉讓條件
    if (!rental.allowTransfer || (rental.state !== 1 && rental.state !== 2)) {
      setActionError('This rental cannot be transferred');
      return;
    }
    
    // 驗證表單
    if (!transferForm.address || !transferForm.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      setActionError('Invalid Ethereum address');
      return;
    }
    
    if (!transferForm.price || isNaN(transferForm.price) || parseFloat(transferForm.price) <= 0) {
      setActionError('Invalid price');
      return;
    }
    
    try {
      setActionLoading(true);
      setActionError(null);
      
      const result = await web3Service.transferRental(
        id,
        transferForm.address,
        transferForm.price
      );
      
      if (result.success) {
        // 關閉轉讓模態框
        setTransferModal(false);
        
        // 重置表單
        setTransferForm({
          address: '',
          price: ''
        });
        
        // 轉讓成功，返回儀表板
        navigate('/dashboard');
      } else {
        throw new Error(result.error || 'Failed to transfer rental');
      }
      
      setActionLoading(false);
    } catch (err) {
      console.error('Error transferring rental:', err);
      setActionError(err.message || 'Failed to transfer rental. Please try again.');
      setActionLoading(false);
    }
  };
  
  // 獲取租約狀態名稱
  const getRentalStateName = (state) => {
    const states = ['Available', 'Reserved', 'Active', 'Completed', 'Cancelled', 'Disputed'];
    return states[state] || 'Unknown';
  };
  
  // 獲取狀態顏色
  const getStateColor = (state) => {
    switch (state) {
      case 0: return 'gray'; // Available
      case 1: return 'yellow'; // Reserved
      case 2: return 'green'; // Active
      case 3: return 'blue'; // Completed
      case 4: return 'red'; // Cancelled
      case 5: return 'orange'; // Disputed
      default: return 'gray';
    }
  };
  
  // 渲染轉讓模態框
  const renderTransferModal = () => {
    if (!transferModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <h2 className="text-xl font-bold mb-4">Transfer Rental</h2>
          
          {actionError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
              {actionError}
            </div>
          )}
          
          <form onSubmit={handleTransferRental}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                name="address"
                value={transferForm.address}
                onChange={handleTransferChange}
                placeholder="0x..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Ethereum address of the person you want to transfer to
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer Price (USDC)
              </label>
              <input
                type="number"
                name="price"
                value={transferForm.price}
                onChange={handleTransferChange}
                step="0.01"
                min="0"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                How much the recipient will pay you for this rental
              </p>
            </div>
            
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => {
                  setTransferModal(false);
                  setActionError(null);
                }}
                className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={actionLoading}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Transfer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };
  
  // 渲染租約詳情
  const renderRentalDetails = () => {
    if (!rental || !property) return null;
    
    const stateColor = getStateColor(rental.state);
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 左側：租約詳情 */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Rental #{rental.id}</h1>
                <span className={`px-3 py-1 rounded-full bg-${stateColor}-100 text-${stateColor}-800 text-sm font-medium`}>
                  {getRentalStateName(rental.state)}
                </span>
              </div>
              <p className="text-blue-100">Property #{rental.propertyId}</p>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h2 className="text-sm font-medium text-gray-500">Check In</h2>
                  <p className="text-lg">{new Date(rental.startDate * 1000).toLocaleDateString()}</p>
                </div>
                
                <div>
                  <h2 className="text-sm font-medium text-gray-500">Check Out</h2>
                  <p className="text-lg">{new Date(rental.endDate * 1000).toLocaleDateString()}</p>
                </div>
                
                <div>
                  <h2 className="text-sm font-medium text-gray-500">Original Price</h2>
                  <p className="text-lg">{rental.basePrice} USDC</p>
                </div>
                
                <div>
                  <h2 className="text-sm font-medium text-gray-500">You Paid</h2>
                  <p className="text-lg">{rental.finalPrice} USDC</p>
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h2 className="text-xl font-bold mb-4">DeFi Earnings</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-500">Base Yield (3-5% APY)</h3>
                    <p className="text-lg font-bold text-green-600">
                      +{parseFloat(rental.yield?.baseYield || 0).toFixed(2)} USDC
                    </p>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-500">Premium Yield (if applicable)</h3>
                    <p className="text-lg font-bold text-green-600">
                      +{parseFloat(rental.yield?.plusYield || 0).toFixed(2)} USDC
                    </p>
                  </div>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <h3 className="text-sm font-medium text-gray-500">Total Savings</h3>
                  <p className="text-lg font-bold text-blue-600">
                    {(parseFloat(rental.basePrice) - parseFloat(rental.finalPrice) + 
                      parseFloat(rental.yield?.baseYield || 0) + 
                      parseFloat(rental.yield?.plusYield || 0)).toFixed(2)} USDC
                  </p>
                  <p className="text-sm text-gray-500">
                    ({(((parseFloat(rental.basePrice) - parseFloat(rental.finalPrice) + 
                       parseFloat(rental.yield?.baseYield || 0) + 
                       parseFloat(rental.yield?.plusYield || 0)) / parseFloat(rental.basePrice)) * 100).toFixed(1)}% off original price)
                  </p>
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h2 className="text-xl font-bold mb-4">Property Details</h2>
                
                <div className="flex mb-4">
                  <img 
                    src={property.metadata?.image || `https://via.placeholder.com/120x80?text=${encodeURIComponent(property.metadata?.name || `Property #${property.id}`)}`}
                    alt={property.metadata?.name || `Property #${property.id}`}
                    className="w-24 h-16 object-cover rounded-md mr-4"
                  />
                  
                  <div>
                    <h3 className="font-bold">{property.metadata?.name || `Property #${property.id}`}</h3>
                    <p className="text-gray-600">{property.location}</p>
                    <a 
                      href={`/properties/${property.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View Property
                    </a>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {property.metadata?.bedrooms && (
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                      </svg>
                      <span>{property.metadata.bedrooms} Beds</span>
                    </div>
                  )}
                  
                  {property.metadata?.bathrooms && (
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.5 2a3.5 3.5 0 101.665 6.58L8.585 10l-1.42 1.42a3.5 3.5 0 101.414 1.414L10 11.414l1.42 1.42a3.5 3.5 0 101.414-1.414L11.414 10l1.42-1.42A3.5 3.5 0 1011.17 7H8.83a3.5 3.5 0 00-3.33-5z" clipRule="evenodd" />
                      </svg>
                      <span>{property.metadata.bathrooms} Baths</span>
                    </div>
                  )}
                  
                  {property.metadata?.squareMeters && (
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5 4a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1H5zm12 7a1 1 0 01-1 1h-3v3a1 1 0 11-2 0v-3H8a1 1 0 110-2h3V7a1 1 0 112 0v3h3a1 1 0 011 1z" clipRule="evenodd" />
                      </svg>
                      <span>{property.metadata.squareMeters} m²</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h2 className="text-xl font-bold mb-4">Parties</h2>
                
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500">Tenant (You)</h3>
                  <div className="flex items-center mt-1">
                    <div className="bg-blue-100 text-blue-800 rounded-full w-8 h-8 flex items-center justify-center mr-2">
                      {rental.tenant.substring(0, 2)}
                    </div>
                    <div>
                      <p>
                        {rental.tenant.substring(0, 6)}...{rental.tenant.substring(rental.tenant.length - 4)}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Landlord</h3>
                  <div className="flex items-center mt-1">
                    <div className="bg-purple-100 text-purple-800 rounded-full w-8 h-8 flex items-center justify-center mr-2">
                      {rental.landlord.substring(0, 2)}
                    </div>
                    <div>
                      <p>
                        {rental.landlord.substring(0, 6)}...{rental.landlord.substring(rental.landlord.length - 4)}
                      </p>
                      <a 
                        href={`https://mumbai.polygonscan.com/address/${rental.landlord}`}
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
              
              {/* NFT 資訊區塊 */}
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h2 className="text-xl font-bold mb-4">NFT Details</h2>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm mb-2">
                    <span className="font-medium">Contract Address:</span>{' '}
                    <a 
                      href={`https://mumbai.polygonscan.com/token/${web3Service.getContractAddress('RentalNFT')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {web3Service.getContractAddress('RentalNFT').substring(0, 6)}...{web3Service.getContractAddress('RentalNFT').substring(web3Service.getContractAddress('RentalNFT').length - 4)}
                    </a>
                  </p>
                  
                  <p className="text-sm mb-2">
                    <span className="font-medium">Token ID:</span> {rental.id}
                  </p>
                  
                  <p className="text-sm">
                    <span className="font-medium">Owner (You):</span>{' '}
                    {rental.tenant.substring(0, 6)}...{rental.tenant.substring(rental.tenant.length - 4)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 右側：操作面板 */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
            <h2 className="text-xl font-bold mb-4">Actions</h2>
            
            {actionError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                {actionError}
              </div>
            )}
            
            <div className="space-y-3">
              {rental.state === 1 && ( // Reserved
                <button
                  onClick={handleCancelRental}
                  disabled={actionLoading}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Cancel Reservation'}
                </button>
              )}
              
              {(rental.state === 1 || rental.state === 2) && rental.allowTransfer && ( // Reserved or Active
                <button
                  onClick={() => setTransferModal(true)}
                  disabled={actionLoading}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Transfer Rental'}
                </button>
              )}
              
              <button
                onClick={() => navigate(`/properties/${rental.propertyId}`)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
              >
                View Property
              </button>
              
              <button
                onClick={() => navigate(`/dashboard`)}
                className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50 transition"
              >
                Back to Dashboard
              </button>
            </div>
            
            {rental.state === 1 && ( // Reserved
              <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-medium text-yellow-800 mb-2">Cancellation Policy</h3>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li>• 30+ days before check-in: 100% refund</li>
                  <li>• 7-30 days before check-in: 95% refund</li>
                  <li>• 1-7 days before check-in: 90% refund</li>
                  <li>• On check-in day: 80% refund</li>
                </ul>
              </div>
            )}
            
            {(rental.state === 1 || rental.state === 2) && rental.allowTransfer && ( // Reserved or Active
              <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-medium text-purple-800 mb-2">Transfer Information</h3>
                <p className="text-sm text-purple-700">
                  You can transfer this rental to another wallet. The recipient will need to pay the transfer price to acquire the rental NFT.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      {renderTransferModal()}
      
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading rental details...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <div className="mt-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        renderRentalDetails()
      )}
    </div>
  );
};

export default RentalDetailPage;