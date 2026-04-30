from pydantic import BaseModel, EmailStr
from typing import Optional


class UserCreate(BaseModel):
    name: str
    email: EmailStr


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserRead(UserCreate):
    id: int

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    stock: int = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None


class ProductRead(ProductCreate):
    id: int

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    user_id: int
    product_id: int
    quantity: int = 1


class OrderRead(BaseModel):
    id: int
    user_id: int
    product_id: int
    quantity: int
    total_price: float

    class Config:
        from_attributes = True
