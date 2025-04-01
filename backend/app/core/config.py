import os
from pydantic import BaseSettings
from typing import Optional, Dict, Any, List

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "DeBooK"
    
    # 安全配置
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-for-jwt")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天
    
    # 數據庫配置
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "sqlite:///./debook.db"
    )
    
    # 區塊鏈配置
    BLOCKCHAIN_PROVIDER: str = os.getenv("BLOCKCHAIN_PROVIDER", "https://polygon-mumbai.infura.io/v3/your-infura-id")
    RENTAL_NFT_ADDRESS: str = os.getenv("RENTAL_NFT_ADDRESS", "0x123...")
    DEFI_INTEGRATION_ADDRESS: str = os.getenv("DEFI_INTEGRATION_ADDRESS", "0x456...")
    ESCROW_ADDRESS: str = os.getenv("ESCROW_ADDRESS", "0x789...")
    GOVERNANCE_ADDRESS: str = os.getenv("GOVERNANCE_ADDRESS", "0xabc...")
    STABLECOIN_ADDRESS: str = os.getenv("STABLECOIN_ADDRESS", "0xdef...")
    
    # IPFS 配置
    IPFS_GATEWAY: str = os.getenv("IPFS_GATEWAY", "https://ipfs.io/ipfs/")
    IPFS_API: str = os.getenv("IPFS_API", "https://ipfs.infura.io:5001/api/v0")
    IPFS_PROJECT_ID: Optional[str] = os.getenv("IPFS_PROJECT_ID")
    IPFS_PROJECT_SECRET: Optional[str] = os.getenv("IPFS_PROJECT_SECRET")
    
    # 其他配置
    DEFAULT_PAGINATION_LIMIT: int = 20
    MAX_PAGINATION_LIMIT: int = 100
    
    # CORS 配置
    CORS_ORIGINS: List[str] = ["*"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()