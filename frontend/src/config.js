const config = {
  contractAddresses: {
    RENTAL_NFT: process.env.REACT_APP_RENTAL_NFT_ADDRESS || '0x123...',
    DEFI_INTEGRATION: process.env.REACT_APP_DEFI_INTEGRATION_ADDRESS || '0x456...',
    ESCROW: process.env.REACT_APP_ESCROW_ADDRESS || '0x789...',
    GOVERNANCE: process.env.REACT_APP_GOVERNANCE_ADDRESS || '0xabc...',
    STABLECOIN: process.env.REACT_APP_STABLECOIN_ADDRESS || '0xdef...',
  },
  apiBaseUrl: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  ipfsGateway: process.env.REACT_APP_IPFS_GATEWAY || 'https://ipfs.io/ipfs/'
};

export default config;
