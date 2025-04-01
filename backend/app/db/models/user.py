from sqlalchemy import Boolean, Column, Integer, String, DateTime
from sqlalchemy.sql import func
from passlib.context import CryptContext
from typing import Optional
import uuid

from app.db.session import Base

# 密碼加密工具
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    wallet_address = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_landlord = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    @staticmethod
    def get_by_username(db, username: str):
        """通過用戶名獲取用戶"""
        return db.query(User).filter(User.username == username).first()
    
    @staticmethod
    def get_by_email(db, email: str):
        """通過郵箱獲取用戶"""
        return db.query(User).filter(User.email == email).first()
    
    @staticmethod
    def get_by_wallet(db, wallet_address: str):
        """通過錢包地址獲取用戶"""
        return db.query(User).filter(User.wallet_address == wallet_address).first()
    
    @staticmethod
    def create(db, user_data):
        """創建新用戶"""
        hashed_password = pwd_context.hash(user_data.password)
        db_user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password,
            wallet_address=user_data.wallet_address,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    
    @staticmethod
    def authenticate(db, username: str, password: str):
        """驗證用戶"""
        user = User.get_by_username(db, username)
        if not user:
            return None
        if not user.is_active:
            return None
        if not pwd_context.verify(password, user.hashed_password):
            return None
        return user
    
    def update_wallet(self, db, wallet_address: str):
        """更新錢包地址"""
        self.wallet_address = wallet_address
        db.commit()
        db.refresh(self)
        return self
    
    def to_dict(self):
        """轉換為字典"""
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "wallet_address": self.wallet_address,
            "is_active": self.is_active,
            "is_landlord": self.is_landlord,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }