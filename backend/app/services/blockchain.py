import json
import time
from typing import Dict, Any, List, Optional, Tuple
from web3 import Web3
from web3.middleware import geth_poa_middleware
from eth_account import Account
from eth_account.signers.local import LocalAccount
import os
import ipfshttpclient
import requests
from app.core.config import settings

class BlockchainService:
    """區塊鏈服務類：處理與智能合約的交互"""
    
    def __init__(self):
        # 初始化Web3連接
        self.web3 = Web3(Web3.HTTPProvider(settings.BLOCKCHAIN_PROVIDER))
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        # 載入合約ABI
        self._load_contract_abis()
        
        # 初始化合約實例
        self.rental_nft = self.web3.eth.contract(
            address=settings.RENTAL_NFT_ADDRESS,
            abi=self.contract_abis["RentalNFT"]
        )
        
        self.defi_integration = self.web3.eth.contract(
            address=settings.DEFI_INTEGRATION_ADDRESS,
            abi=self.contract_abis["DeFiIntegration"]
        )
        
        self.escrow = self.web3.eth.contract(
            address=settings.ESCROW_ADDRESS,
            abi=self.contract_abis["Escrow"]
        )
        
        self.governance = self.web3.eth.contract(
            address=settings.GOVERNANCE_ADDRESS,
            abi=self.contract_abis["Governance"]
        )
        
        # 後端管理員帳戶 (用於管理操作)
        self.admin_account: Optional[LocalAccount] = None
        self._setup_admin_account()
        
        # 初始化 IPFS 客戶端
        self._setup_ipfs_client()
    
    def _load_contract_abis(self):
        """載入智能合約 ABI"""
        self.contract_abis = {}
        
        contract_files = {
            "RentalNFT": "RentalNFT.json",
            "DeFiIntegration": "DeFiIntegration.json",
            "Escrow": "Escrow.json",
            "Governance": "Governance.json"
        }
        
        for name, filename in contract_files.items():
            # 假設 ABI 文件位於 contracts 目錄中
            path = os.path.join(os.path.dirname(__file__), f"../../contracts/{filename}")
            try:
                with open(path, "r") as file:
                    contract_data = json.load(file)
                    self.contract_abis[name] = contract_data["abi"]
            except Exception as e:
                print(f"Error loading ABI for {name}: {e}")
                # 使用空 ABI 防止程序崩潰
                self.contract_abis[name] = []
    
    def _setup_admin_account(self):
        """設置管理員帳戶"""
        private_key = os.getenv("ADMIN_PRIVATE_KEY")
        if private_key:
            try:
                self.admin_account = Account.from_key(private_key)
                print(f"Admin account set up: {self.admin_account.address}")
            except Exception as e:
                print(f"Error setting up admin account: {e}")
        else:
            print("No admin private key provided, admin operations will not be available")
    
    def _setup_ipfs_client(self):
        """設置 IPFS 客戶端"""
        try:
            # 如果有 Infura 項目憑證，使用它們
            if settings.IPFS_PROJECT_ID and settings.IPFS_PROJECT_SECRET:
                auth = (settings.IPFS_PROJECT_ID, settings.IPFS_PROJECT_SECRET)
                self.ipfs_client = None  # 使用自定義請求而不是客戶端庫
                print("Using IPFS with Infura credentials")
            else:
                try:
                    self.ipfs_client = ipfshttpclient.connect(settings.IPFS_API)
                    print("IPFS client connected")
                except Exception as e:
                    print(f"Error connecting to IPFS: {e}")
                    self.ipfs_client = None
        except Exception as e:
            print(f"Error setting up IPFS client: {e}")
            self.ipfs_client = None
    
    # 合約讀取函數
    
    async def get_property_count(self) -> int:
        """獲取物業總數"""
        try:
            count = await self.rental_nft.functions.getPropertyCount().call()
            return count
        except Exception as e:
            print(f"Error getting property count: {e}")
            return 0
    
    async def get_property(self, property_id: int) -> Dict[str, Any]:
        """獲取物業詳情"""
        try:
            property_data = await self.rental_nft.functions.properties(property_id).call()
            
            # 獲取物業元數據
            metadata = await self._get_property_metadata(property_data[8])  # metadataURI
            
            return {
                "id": property_id,
                "owner": property_data[0],
                "location": property_data[1],
                "pricePerMonth": self.web3.fromWei(property_data[2], 'ether'),
                "minRentalDuration": property_data[3],
                "maxRentalDuration": property_data[4],
                "available": property_data[5],
                "pricingModel": property_data[6],
                "depositRequirement": property_data[7],
                "metadataURI": property_data[8],
                "metadata": metadata
            }
        except Exception as e:
            print(f"Error getting property {property_id}: {e}")
            return {}
    
    async def get_available_properties(self, skip: int = 0, limit: int = 20) -> List[Dict[str, Any]]:
        """獲取可用物業列表"""
        try:
            property_count = await self.get_property_count()
            properties = []
            
            for i in range(1, property_count + 1):
                property_data = await self.get_property(i)
                if property_data and property_data.get("available", False):
                    properties.append(property_data)
            
            # 分頁
            return properties[skip:skip + limit]
        except Exception as e:
            print(f"Error getting available properties: {e}")
            return []
    
    async def get_rental(self, rental_id: int) -> Dict[str, Any]:
        """獲取租約詳情"""
        try:
            rental_data = await self.rental_nft.functions.rentalRecords(rental_id).call()
            
            return {
                "id": rental_id,
                "propertyId": rental_data[0],
                "landlord": rental_data[1],
                "tenant": rental_data[2],
                "startDate": rental_data[3],
                "endDate": rental_data[4],
                "basePrice": self.web3.fromWei(rental_data[5], 'ether'),
                "finalPrice": self.web3.fromWei(rental_data[6], 'ether'),
                "deposit": self.web3.fromWei(rental_data[7], 'ether'),
                "discountA": self.web3.fromWei(rental_data[8], 'ether'),
                "discountBBase": self.web3.fromWei(rental_data[9], 'ether'),
                "discountBPlus": self.web3.fromWei(rental_data[10], 'ether'),
                "state": rental_data[11],
                "allowTransfer": rental_data[12],
                "cancelDeadline": rental_data[13],
                "metadataURI": rental_data[14]
            }
        except Exception as e:
            print(f"Error getting rental {rental_id}: {e}")
            return {}
    
    async def get_user_rentals(self, user_address: str) -> List[Dict[str, Any]]:
        """獲取用戶的租約列表"""
        try:
            rental_ids = await self.rental_nft.functions.getTenantRentals(user_address).call()
            rentals = []
            
            for rental_id in rental_ids:
                rental_data = await self.get_rental(rental_id)
                if rental_data:
                    rentals.append(rental_data)
            
            return rentals
        except Exception as e:
            print(f"Error getting user rentals for {user_address}: {e}")
            return []
    
    async def get_landlord_properties(self, landlord_address: str) -> List[Dict[str, Any]]:
        """獲取房東的物業列表"""
        try:
            property_ids = await self.rental_nft.functions.getLandlordProperties(landlord_address).call()
            properties = []
            
            for property_id in property_ids:
                property_data = await self.get_property(property_id)
                if property_data:
                    properties.append(property_data)
            
            return properties
        except Exception as e:
            print(f"Error getting landlord properties for {landlord_address}: {e}")
            return []
    
    async def calculate_rental_price(
        self, property_id: int, start_timestamp: int, end_timestamp: int, advance_booking_days: int
    ) -> Dict[str, Any]:
        """計算租約價格"""
        try:
            result = await self.rental_nft.functions.calculateRentalPrice(
                property_id, start_timestamp, end_timestamp, advance_booking_days
            ).call()
            
            base_price, discount_a, final_price = result
            
            # 計算平台費用 (3%)
            platform_fee = int(final_price * 3 / 100)
            total_payment = final_price + platform_fee
            
            return {
                "basePrice": self.web3.fromWei(base_price, 'ether'),
                "discountA": self.web3.fromWei(discount_a, 'ether'),
                "finalPrice": self.web3.fromWei(final_price, 'ether'),
                "platformFee": self.web3.fromWei(platform_fee, 'ether'),
                "totalPayment": self.web3.fromWei(total_payment, 'ether'),
                # 估計DeFi收益 (簡化版，實際應調用DeFi合約)
                "estimatedDiscountB": float(self.web3.fromWei(base_price, 'ether')) * 0.04 * 0.7
            }
        except Exception as e:
            print(f"Error calculating rental price: {e}")
            return {}
    
    # 合約寫入函數 (需要管理員帳戶或代表用戶簽名)
    
    async def list_property(
        self, owner_address: str, property_data: Dict[str, Any], private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """列出新物業 (使用指定私鑰或管理員帳戶)"""
        try:
            # 檢查參數
            required_fields = ['location', 'pricePerMonth', 'minRentalDuration', 'maxRentalDuration', 'depositRequirement']
            for field in required_fields:
                if field not in property_data:
                    return {"success": False, "error": f"Missing field: {field}"}
            
            # 上傳元數據到IPFS (如果提供)
            metadata_uri = ""
            if "metadata" in property_data:
                metadata_uri = await self._upload_to_ipfs(property_data["metadata"])
            
            # 準備交易數據
            price_in_wei = self.web3.toWei(property_data["pricePerMonth"], 'ether')
            
            function_call = self.rental_nft.functions.listProperty(
                property_data["location"],
                price_in_wei,
                property_data["minRentalDuration"],
                property_data["maxRentalDuration"],
                property_data["depositRequirement"],
                metadata_uri
            )
            
            # 構建和發送交易
            tx_hash = await self._build_and_send_tx(function_call, owner_address, private_key)
            
            # 等待交易收據
            tx_receipt = self.web3.eth.waitForTransactionReceipt(tx_hash)
            
            # 解析事件獲取物業ID
            property_id = 0
            for log in tx_receipt.logs:
                try:
                    # 嘗試解析PropertyListed事件
                    event = self.rental_nft.events.PropertyListed().processLog(log)
                    property_id = event['args']['propertyId']
                    break
                except:
                    continue
            
            return {
                "success": True,
                "propertyId": property_id,
                "transaction": {
                    "hash": tx_hash.hex(),
                    "blockNumber": tx_receipt["blockNumber"]
                }
            }
        except Exception as e:
            print(f"Error listing property: {e}")
            return {"success": False, "error": str(e)}
    
    # 輔助函數
    
    async def _get_property_metadata(self, metadata_uri: str) -> Dict[str, Any]:
        """從IPFS獲取物業元數據"""
        try:
            if not metadata_uri or not metadata_uri.startswith("ipfs://"):
                # 返回默認元數據
                return {
                    "name": "Unknown Property",
                    "description": "No metadata available",
                    "image": "https://via.placeholder.com/400x300?text=No+Image"
                }
            
            # 從IPFS獲取數據
            ipfs_hash = metadata_uri.replace("ipfs://", "")
            response = requests.get(f"{settings.IPFS_GATEWAY}{ipfs_hash}")
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error fetching metadata from IPFS: {response.status_code}")
                return {}
        except Exception as e:
            print(f"Error getting property metadata: {e}")
            return {}
    
    async def _upload_to_ipfs(self, data: Dict[str, Any]) -> str:
        """上傳數據到IPFS"""
        try:
            if self.ipfs_client is None:
                # 使用 Infura IPFS API
                if settings.IPFS_PROJECT_ID and settings.IPFS_PROJECT_SECRET:
                    auth = (settings.IPFS_PROJECT_ID, settings.IPFS_PROJECT_SECRET)
                    response = requests.post(
                        f"{settings.IPFS_API}/add",
                        files={"file": json.dumps(data)},
                        auth=auth
                    )
                    if response.status_code == 200:
                        ipfs_hash = response.json()["Hash"]
                        return f"ipfs://{ipfs_hash}"
                    else:
                        print(f"Error uploading to Infura IPFS: {response.status_code}")
                        return ""
                else:
                    print("No IPFS client available")
                    return ""
            else:
                # 使用本地IPFS客戶端
                result = self.ipfs_client.add_json(data)
                return f"ipfs://{result}"
        except Exception as e:
            print(f"Error uploading to IPFS: {e}")
            return ""
    
    async def _build_and_send_tx(self, function_call, from_address: str, private_key: Optional[str] = None) -> bytes:
        """構建並發送交易"""
        # 獲取nonce
        nonce = self.web3.eth.getTransactionCount(from_address)
        
        # 構建交易
        tx = function_call.buildTransaction({
            'from': from_address,
            'nonce': nonce,
            'gas': 2000000,  # 預設gas限制
            'gasPrice': self.web3.eth.gasPrice
        })
        
        # 簽名交易
        if private_key:
            signed_tx = self.web3.eth.account.signTransaction(tx, private_key)
        elif self.admin_account and from_address.lower() == self.admin_account.address.lower():
            signed_tx = self.web3.eth.account.signTransaction(tx, self.admin_account.key)
        else:
            raise ValueError("No private key provided and admin account doesn't match from_address")
        
        # 發送交易
        tx_hash = self.web3.eth.sendRawTransaction(signed_tx.rawTransaction)
        return tx_hash