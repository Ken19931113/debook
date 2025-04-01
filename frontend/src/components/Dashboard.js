// 智能合約部署腳本
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment...");
  
  // 獲取部署賬戶
  const [deployer] = await ethers.getSigners();
  
  console.log(
    "Deploying contracts with the account:",
    deployer.address
  );
  
  console.log("Account balance:", (await deployer.getBalance()).toString());
  
  // 1. 部署 RentalNFT 合約
  const RentalNFT = await hre.ethers.getContractFactory("RentalNFT");
  const rentalNFT = await RentalNFT.deploy();
  await rentalNFT.deployed();
  console.log("RentalNFT deployed to:", rentalNFT.address);
  
  // 2. 部署 DeFiIntegration 合約
  // 這裡使用測試網上的 USDC 地址和部署者地址作為 treasury
  const stablecoinAddress = process.env.STABLECOIN_ADDRESS || "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // Mainnet USDC
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  
  const DeFiIntegration = await hre.ethers.getContractFactory("DeFiIntegration");
  const defiIntegration = await DeFiIntegration.deploy(stablecoinAddress, treasuryAddress);
  await defiIntegration.deployed();
  console.log("DeFiIntegration deployed to:", defiIntegration.address);
  
  // 3. 部署 Escrow 合約
  const insuranceFundAddress = process.env.INSURANCE_FUND_ADDRESS || deployer.address;
  
  const Escrow = await hre.ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(stablecoinAddress, treasuryAddress, insuranceFundAddress);
  await escrow.deployed();
  console.log("Escrow deployed to:", escrow.address);
  
  // 4. 部署 Governance 合約
  const governanceTokenAddress = process.env.GOVERNANCE_TOKEN_ADDRESS || stablecoinAddress; // 示例中使用 USDC 作為治理代幣
  
  const Governance = await hre.ethers.getContractFactory("Governance");
  const governance = await Governance.deploy(governanceTokenAddress, treasuryAddress);
  await governance.deployed();
  console.log("Governance deployed to:", governance.address);
  
  // 5. 設置合約之間的關係
  console.log("Setting up contract relationships...");
  
  // 設置 RentalNFT 的 DeFiIntegration 合約地址
  await rentalNFT.setDefiIntegrationContract(defiIntegration.address);
  console.log("Set DeFiIntegration address in RentalNFT");
  
  // 設置 DeFiIntegration 的 RentalNFT 合約地址
  await defiIntegration.setRentalContract(rentalNFT.address);
  console.log("Set RentalNFT address in DeFiIntegration");
  
  // 設置 Escrow 的 RentalNFT 合約地址
  await escrow.setRentalContract(rentalNFT.address);
  console.log("Set RentalNFT address in Escrow");
  
  // 將部署資訊寫入檔案供前後端使用
  const deploymentInfo = {
    rentalNFTAddress: rentalNFT.address,
    defiIntegrationAddress: defiIntegration.address,
    escrowAddress: escrow.address,
    governanceAddress: governance.address,
    stablecoinAddress: stablecoinAddress,
    network: hre.network.name,
    deploymentTime: new Date().toISOString()
  };
  
  // 建立部署資訊資料夾
  const deploymentDir = path.join(__dirname, "../deployments", hre.network.name);
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  
  // 寫入部署資訊
  fs.writeFileSync(
    path.join(deploymentDir, "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment information saved to", path.join(deploymentDir, "deployment.json"));
  
  // 複製 ABI 檔案到前端
  const frontendContractsDir = path.join(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }
  
  // 複製 RentalNFT ABI
  const rentalNFTArtifact = await hre.artifacts.readArtifact("RentalNFT");
  fs.writeFileSync(
    path.join(frontendContractsDir, "RentalNFT.json"),
    JSON.stringify({
      contractName: rentalNFTArtifact.contractName,
      abi: rentalNFTArtifact.abi,
      address: rentalNFT.address
    }, null, 2)
  );
  
  // 複製 DeFiIntegration ABI
  const defiIntegrationArtifact = await hre.artifacts.readArtifact("DeFiIntegration");
  fs.writeFileSync(
    path.join(frontendContractsDir, "DeFiIntegration.json"),
    JSON.stringify({
      contractName: defiIntegrationArtifact.contractName,
      abi: defiIntegrationArtifact.abi,
      address: defiIntegration.address
    }, null, 2)
  );
  
  // 複製 Escrow ABI
  const escrowArtifact = await hre.artifacts.readArtifact("Escrow");
  fs.writeFileSync(
    path.join(frontendContractsDir, "Escrow.json"),
    JSON.stringify({
      contractName: escrowArtifact.contractName,
      abi: escrowArtifact.abi,
      address: escrow.address
    }, null, 2)
  );
  
  // 複製 Governance ABI
  const governanceArtifact = await hre.artifacts.readArtifact("Governance");
  fs.writeFileSync(
    path.join(frontendContractsDir, "Governance.json"),
    JSON.stringify({
      contractName: governanceArtifact.contractName,
      abi: governanceArtifact.abi,
      address: governance.address
    }, null, 2)
  );
  
  console.log("Contract ABIs copied to frontend");
  
  // 創建 .env 檔案供前端使用
  const envContent = `
REACT_APP_RENTAL_NFT_ADDRESS=${rentalNFT.address}
REACT_APP_DEFI_INTEGRATION_ADDRESS=${defiIntegration.address}
REACT_APP_ESCROW_ADDRESS=${escrow.address}
REACT_APP_GOVERNANCE_ADDRESS=${governance.address}
REACT_APP_STABLECOIN_ADDRESS=${stablecoinAddress}
REACT_APP_NETWORK=${hre.network.name}
REACT_APP_API_BASE_URL=http://localhost:8000
REACT_APP_IPFS_GATEWAY=https://ipfs.io/ipfs/
REACT_APP_WALLETCONNECT_PROJECT_ID=your-project-id
  `;
  
  fs.writeFileSync(
    path.join(__dirname, "../../frontend/.env.local"),
    envContent.trim()
  );
  console.log("Frontend .env.local file created");
  
  console.log("Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });