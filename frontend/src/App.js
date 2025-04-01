import React from 'react';
import { Routes, Route } from 'react-router-dom';
import PropertyListing from './components/PropertyListing';
import DashboardPage from './pages/DashboardPage';
import ListPropertyPage from './pages/ListPropertyPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import RentalDetailPage from './pages/RentalDetailPage';
import { useAccount } from 'wagmi';
import './styles/App.css';

function App() {
  const { isConnected } = useAccount();

  return (
    <div className="App min-h-screen flex flex-col">
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">
              <a href="/" className="hover:text-blue-100 transition">DeBooK</a>
            </h1>
            <p className="text-sm text-blue-100">區塊鏈驅動的長期租賃平台</p>
          </div>
          
          <nav className="flex items-center space-x-6">
            <a href="/" className="text-white hover:text-blue-100 transition">
              Browse
            </a>
            
            {isConnected && (
              <>
                <a href="/dashboard" className="text-white hover:text-blue-100 transition">
                  Dashboard
                </a>
                
                <a href="/list-property" className="bg-white text-blue-600 px-4 py-2 rounded-md hover:bg-blue-50 transition">
                  List Property
                </a>
              </>
            )}
            
            <div className="ml-2">
              <w3m-button />
            </div>
          </nav>
        </div>
      </header>
      
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<PropertyListing />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/list-property" element={<ListPropertyPage />} />
          <Route path="/properties/:id" element={<PropertyDetailPage />} />
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </main>
      
      <footer className="bg-gray-100 p-6 mt-12">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4">DeBooK</h3>
              <p className="text-gray-600">
                DeBooK is a blockchain-driven long-term rental platform that combines NFTs with DeFi to provide unique benefits for both tenants and landlords.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li>
                  <a href="/" className="text-blue-600 hover:underline">Browse Properties</a>
                </li>
                <li>
                  <a href="/dashboard" className="text-blue-600 hover:underline">Dashboard</a>
                </li>
                <li>
                  <a href="/list-property" className="text-blue-600 hover:underline">List Property</a>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-4">Connect With Us</h3>
              <p className="text-gray-600">
                Contact: info@debook.example.com<br />
                Support: support@debook.example.com
              </p>
            </div>
          </div>
          
          <div className="border-t border-gray-300 mt-8 pt-6 text-center text-gray-600">
            &copy; {new Date().getFullYear()} DeBooK - 長期租賃區塊鏈平台. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;