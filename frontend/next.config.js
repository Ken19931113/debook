/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['ipfs.io', 'via.placeholder.com'],
  },
  env: {
    RENTAL_NFT_ADDRESS: process.env.REACT_APP_RENTAL_NFT_ADDRESS,
    DEFI_INTEGRATION_ADDRESS: process.env.REACT_APP_DEFI_INTEGRATION_ADDRESS,
    ESCROW_ADDRESS: process.env.REACT_APP_ESCROW_ADDRESS,
    GOVERNANCE_ADDRESS: process.env.REACT_APP_GOVERNANCE_ADDRESS,
    STABLECOIN_ADDRESS: process.env.REACT_APP_STABLECOIN_ADDRESS,
    API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
    IPFS_GATEWAY: process.env.REACT_APP_IPFS_GATEWAY,
    WALLETCONNECT_PROJECT_ID: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID
  },
}

module.exports = nextConfig
