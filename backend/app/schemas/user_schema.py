from fastapi_users import schemas
from app.models.user_model import UserRole
import uuid
from pydantic import BaseModel

class UserRead(schemas.BaseUser[uuid.UUID]):
    full_name: str
    role: UserRole

class UserCreate(schemas.BaseUserCreate):
    full_name: str
    role: UserRole = UserRole.STUDENT # Default role on creation

class UserUpdate(schemas.BaseUserUpdate):
    full_name : str | None = None
    role: UserRole | None = None
    is_superuser : bool = False

class LoginRequest(BaseModel):
    email: str
    password: str