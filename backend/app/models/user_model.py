from ..db import Base
from sqlalchemy import String
from sqlalchemy import Column, Enum as SQLAlchemyEnum
from fastapi_users.db import SQLAlchemyBaseUserTableUUID
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    STUDENT = "student"

class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"
    full_name = Column(String)
    role = Column(SQLAlchemyEnum(UserRole), default=UserRole.STUDENT)
