from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import time

from app.core.security import get_current_active_user
from app.db.models.user import User
from app.services.blockchain import BlockchainService

# 引入區塊鏈服務
blockchain_service = BlockchainService()

# 創建 API 路由器
api_router = APIRouter()

# 數據模型定義
class PropertyBase(BaseModel):
    location: str
    pricePerMonth: float
    minRentalDuration: int
    maxRentalDuration: int
    depositRequirement: int

class PropertyCreate(PropertyBase):
    metadata: Optional[Dict[str, Any]] = None

class PropertyResponse(PropertyBase):
    id: int
    owner: str
    available: bool
    metadata: Optional[Dict[str, Any]] = None
    
    class Config:
        orm_mode = True

class RentalBase(BaseModel):
    propertyId: int
    startDate: int  # Unix timestamp
    endDate: int    # Unix timestamp

class RentalCreate(RentalBase):
    strategy: str = "conservative"

class RentalResponse(RentalBase):
    id: int
    landlord: str
    tenant: str
    basePrice: float
    finalPrice: float
    state: int
    allowTransfer: bool
    
    class Config:
        orm_mode = True

class PriceCalculation(BaseModel):
    basePrice: float
    discountA: float
    finalPrice: float
    platformFee: float
    totalPayment: float
    estimatedDiscountB: float

class TransactionResponse(BaseModel):
    success: bool
    transaction: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# API 端點

@api_router.get("/properties/", response_model=List[PropertyResponse])
async def get_properties(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    location: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_duration: Optional[int] = None,
    max_duration: Optional[int] = None
):
    """獲取可用物業列表"""
    properties = await blockchain_service.get_available_properties(skip, limit)
    
    # 應用過濾條件
    if location:
        properties = [p for p in properties if location.lower() in p["location"].lower()]
    if min_price is not None:
        properties = [p for p in properties if float(p["pricePerMonth"]) >= min_price]
    if max_price is not None:
        properties = [p for p in properties if float(p["pricePerMonth"]) <= max_price]
    if min_duration is not None:
        properties = [p for p in properties if p["minRentalDuration"] >= min_duration]
    if max_duration is not None:
        properties = [p for p in properties if p["maxRentalDuration"] <= max_duration]
    
    return properties

@api_router.get("/properties/{property_id}", response_model=PropertyResponse)
async def get_property(property_id: int):
    """獲取特定物業詳情"""
    property_data = await blockchain_service.get_property(property_id)
    if not property_data:
        raise HTTPException(status_code=404, detail="Property not found")
    return property_data

@api_router.post("/properties/", response_model=TransactionResponse)
async def create_property(
    property_data: PropertyCreate,
    current_user: User = Depends(get_current_active_user)
):
    """建立新物業 (需要登入)"""
    if not current_user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address not set")
    
    # 更新用戶為房東
    current_user.is_landlord = True
    
    # 將物業添加到區塊鏈
    result = await blockchain_service.list_property(
        current_user.wallet_address,
        property_data.dict(),
        None  # 不提供私鑰，用戶需要自己簽名交易
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create property"))
    
    return result

@api_router.get("/rentals/", response_model=List[RentalResponse])
async def get_user_rentals(current_user: User = Depends(get_current_active_user)):
    """獲取當前用戶的租約 (需要登入)"""
    if not current_user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address not set")
    
    rentals = await blockchain_service.get_user_rentals(current_user.wallet_address)
    return rentals

@api_router.get("/rentals/{rental_id}", response_model=RentalResponse)
async def get_rental(rental_id: int):
    """獲取特定租約詳情"""
    rental = await blockchain_service.get_rental(rental_id)
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    return rental

@api_router.post("/rentals/calculate", response_model=PriceCalculation)
async def calculate_rental_price(
    property_id: int = Body(...),
    start_date: int = Body(...),  # Unix timestamp
    end_date: int = Body(...),    # Unix timestamp
):
    """計算租約價格"""
    # 計算提前預訂天數
    now = int(time.time())
    advance_booking_days = (start_date - now) // 86400  # 一天的秒數
    
    price_calc = await blockchain_service.calculate_rental_price(
        property_id, start_date, end_date, advance_booking_days
    )
    
    if not price_calc:
        raise HTTPException(status_code=400, detail="Failed to calculate price")
    
    return price_calc

@api_router.get("/landlord/properties/", response_model=List[PropertyResponse])
async def get_landlord_properties(current_user: User = Depends(get_current_active_user)):
    """獲取當前房東的物業 (需要登入)"""
    if not current_user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address not set")
    
    properties = await blockchain_service.get_landlord_properties(current_user.wallet_address)
    return properties