from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# 引入自定義模組
from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import get_db
from app.core.security import create_access_token, get_current_active_user
from app.db.models.user import User
from app.services.blockchain import BlockchainService

# 載入環境變量
load_dotenv()

app = FastAPI(
    title="DeBooK API",
    description="DeBooK 長期租賃區塊鏈平台 API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生產環境中應設為特定網址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含 API 路由
app.include_router(api_router, prefix=settings.API_V1_STR)

# 認證相關模型
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    wallet_address: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

# 創建區塊鏈服務實例
blockchain_service = BlockchainService()

@app.get("/")
async def root():
    return {"message": "Welcome to DeBooK API", "docs": "/docs"}

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: UserLogin, db = Depends(get_db)):
    user = User.authenticate(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/register", response_model=Token)
async def register_user(user_data: UserCreate, db = Depends(get_db)):
    # 檢查用戶名或郵箱是否已存在
    existing_user = User.get_by_username(db, user_data.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    existing_email = User.get_by_email(db, user_data.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # 創建新用戶
    user = User.create(db, user_data)
    
    # 創建訪問令牌
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return {
        "username": current_user.username,
        "email": current_user.email,
        "wallet_address": current_user.wallet_address,
        "is_active": current_user.is_active,
        "is_landlord": current_user.is_landlord,
        "created_at": current_user.created_at
    }

@app.post("/users/me/wallet")
async def update_wallet_address(
    wallet_address: str,
    current_user: User = Depends(get_current_active_user),
    db = Depends(get_db)
):
    current_user.update_wallet(db, wallet_address)
    return {"status": "success", "wallet_address": wallet_address}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)