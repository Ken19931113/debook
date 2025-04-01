import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import web3Service from '../services/web3Service';
import axios from 'axios';
import config from '../config';

const PropertyForm = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [successDetails, setSuccessDetails] = useState(null);
  
  // 表單狀態
  const [formValues, setFormValues] = useState({
    name: '',
    description: '',
    location: '',
    pricePerMonth: '',
    minRentalDuration: 1,
    maxRentalDuration: 12,
    depositRequirement: 30, // 默認30%
    bedrooms: 1,
    bathrooms: 1,
    squareMeters: '',
    amenities: [],
    images: []
  });
  
  // 可選設施列表
  const amenityOptions = [
    'WiFi', 'Air Conditioning', 'Heating', 'Kitchen', 'Washing Machine',
    'Dryer', 'TV', 'Free Parking', 'Pool', 'Gym', 'Elevator',
    'Wheelchair Accessible', 'Smoke Detector', 'First Aid Kit'
  ];
  
  // 處理輸入變化
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      // 處理設施多選
      if (checked) {
        setFormValues({
          ...formValues,
          amenities: [...formValues.amenities, value]
        });
      } else {
        setFormValues({
          ...formValues,
          amenities: formValues.amenities.filter(item => item !== value)
        });
      }
    } else if (name === 'pricePerMonth' || name === 'squareMeters') {
      // 只允許數字和小數點
      if (value === '' || /^\d*\.?\d*$/.test(value)) {
        setFormValues({
          ...formValues,
          [name]: value
        });
      }
    } else if (name === 'minRentalDuration' || name === 'maxRentalDuration' || name === 'bedrooms' || name === 'bathrooms') {
      // 只允許整數
      if (value === '' || /^\d+$/.test(value)) {
        setFormValues({
          ...formValues,
          [name]: value
        });
      }
    } else {
      setFormValues({
        ...formValues,
        [name]: value
      });
    }
  };
  
  // 處理圖片上傳
  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length > 5) {
      setError('You can upload up to 5 images only.');
      return;
    }
    
    // 這只是簡易實現，實際應用中應該上傳到 IPFS 或其他存儲服務
    const imageFiles = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
    }));
    
    setFormValues({
      ...formValues,
      images: imageFiles
    });
  };
  
  // 處理表單提交
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      setError('Please connect your wallet to list a property');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      
      // 基本驗證
      if (!formValues.name || !formValues.location || !formValues.pricePerMonth) {
        throw new Error('Please fill all required fields');
      }
      
      if (parseInt(formValues.minRentalDuration) > parseInt(formValues.maxRentalDuration)) {
        throw new Error('Minimum rental duration cannot be greater than maximum duration');
      }
      
      // 準備上傳的元數據
      const metadata = {
        name: formValues.name,
        description: formValues.description,
        bedrooms: parseInt(formValues.bedrooms),
        bathrooms: parseInt(formValues.bathrooms),
        squareMeters: parseFloat(formValues.squareMeters) || 0,
        amenities: formValues.amenities,
        image: formValues.images.length > 0 ? 
          `https://via.placeholder.com/800x600?text=${encodeURIComponent(formValues.name)}` : 
          `https://via.placeholder.com/800x600?text=No+Image`
      };
      
      // 準備物業數據
      const propertyData = {
        location: formValues.location,
        pricePerMonth: parseFloat(formValues.pricePerMonth),
        minRentalDuration: parseInt(formValues.minRentalDuration),
        maxRentalDuration: parseInt(formValues.maxRentalDuration),
        depositRequirement: parseInt(formValues.depositRequirement),
        metadata: metadata
      };
      
      // 1. 嘗試通過後端 API 創建物業
      let backendResponse = null;
      try {
        const token = localStorage.getItem('accessToken');
        if (token) {
          const { data } = await axios.post(
            `${config.apiBaseUrl}/api/v1/properties/`,
            propertyData,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          backendResponse = data;
        }
      } catch (err) {
        console.warn("Failed to record property in backend:", err);
        // 繼續執行，因為關鍵功能在鏈上
      }
      
      // 2. 通過 Web3 服務在區塊鏈上創建物業
      const result = await web3Service.listProperty(propertyData);
      
      if (result.success) {
        setSuccess(true);
        setSuccessDetails({
          propertyId: result.propertyId,
          transaction: result.transaction
        });
        
        // 重置表單
        setFormValues({
          name: '',
          description: '',
          location: '',
          pricePerMonth: '',
          minRentalDuration: 1,
          maxRentalDuration: 12,
          depositRequirement: 30,
          bedrooms: 1,
          bathrooms: 1,
          squareMeters: '',
          amenities: [],
          images: []
        });
      } else {
        throw new Error(result.error || "Failed to list property on blockchain");
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Error listing property:", err);
      setError(err.message || "Failed to list property. Please try again.");
      setLoading(false);
    }
  };
  
  const handleConnect = () => {
    // 觸發 Web3Modal
    document.querySelector('w3m-button')?.click();
  };
  
  // 渲染成功訊息
  const renderSuccess = () => {
    if (!success || !successDetails) return null;
    
    return (
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
        <h3 className="font-bold">Property Listed Successfully!</h3>
        <p>Your property has been listed with ID: {successDetails.propertyId}</p>
        <p className="text-sm mt-2">
          Transaction Hash: <a 
            href={`https://mumbai.polygonscan.com/tx/${successDetails.transaction.hash}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {successDetails.transaction.hash.substring(0, 10)}...
          </a>
        </p>
        <div className="mt-4">
          <button
            className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition"
            onClick={() => window.location.href = `/properties/${successDetails.propertyId}`}
          >
            View Your Property
          </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">List Your Property</h1>
      
      {!isConnected ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
          <p className="text-gray-600 mb-6">Connect your wallet to list a property</p>
          <button 
            onClick={handleConnect}
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          {renderSuccess()}
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Basic Information</h2>
              
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2" htmlFor="name">
                  Property Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formValues.name}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2" htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formValues.description}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2" htmlFor="location">
                  Location *
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formValues.location}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="City, Country"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="pricePerMonth">
                    Monthly Price (USDC) *
                  </label>
                  <input
                    type="text"
                    id="pricePerMonth"
                    name="pricePerMonth"
                    value={formValues.pricePerMonth}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="depositRequirement">
                    Deposit Requirement (%)
                  </label>
                  <select
                    id="depositRequirement"
                    name="depositRequirement"
                    value={formValues.depositRequirement}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="10">10%</option>
                    <option value="20">20%</option>
                    <option value="30">30%</option>
                    <option value="40">40%</option>
                    <option value="50">50%</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Rental Terms</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="minRentalDuration">
                    Minimum Rental Duration (months)
                  </label>
                  <input
                    type="number"
                    id="minRentalDuration"
                    name="minRentalDuration"
                    value={formValues.minRentalDuration}
                    onChange={handleInputChange}
                    min="1"
                    max="24"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="maxRentalDuration">
                    Maximum Rental Duration (months)
                  </label>
                  <input
                    type="number"
                    id="maxRentalDuration"
                    name="maxRentalDuration"
                    value={formValues.maxRentalDuration}
                    onChange={handleInputChange}
                    min="1"
                    max="36"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Property Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="bedrooms">
                    Bedrooms
                  </label>
                  <input
                    type="number"
                    id="bedrooms"
                    name="bedrooms"
                    value={formValues.bedrooms}
                    onChange={handleInputChange}
                    min="0"
                    max="10"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="bathrooms">
                    Bathrooms
                  </label>
                  <input
                    type="number"
                    id="bathrooms"
                    name="bathrooms"
                    value={formValues.bathrooms}
                    onChange={handleInputChange}
                    min="0"
                    max="10"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="squareMeters">
                    Square Meters
                  </label>
                  <input
                    type="text"
                    id="squareMeters"
                    name="squareMeters"
                    value={formValues.squareMeters}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2">
                  Amenities
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {amenityOptions.map(amenity => (
                    <div key={amenity} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`amenity-${amenity}`}
                        name="amenities"
                        value={amenity}
                        checked={formValues.amenities.includes(amenity)}
                        onChange={handleInputChange}
                        className="mr-2"
                      />
                      <label htmlFor={`amenity-${amenity}`}>
                        {amenity}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Images</h2>
              
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2" htmlFor="images">
                  Upload Images (Max 5)
                </label>
                <input
                  type="file"
                  id="images"
                  name="images"
                  onChange={handleImageChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  accept="image/*"
                  multiple
                />
                <p className="text-xs text-gray-500 mt-1">
                  Note: Images will be stored on a placeholder service for this demo
                </p>
              </div>
              
              {formValues.images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
                  {formValues.images.map((image, index) => (
                    <div key={index} className="relative">
                      <img
                        src={image.preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-md"
                      />
                      <button
                        type="button"
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                        onClick={() => {
                          const newImages = [...formValues.images];
                          newImages.splice(index, 1);
                          setFormValues({
                            ...formValues,
                            images: newImages
                          });
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="bg-gray-300 text-gray-800 py-2 px-6 rounded-md hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={loading}
                className="bg-green-600 text-white py-2 px-6 rounded-md hover:bg-green-700 transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'List Property'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default PropertyForm;