from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from fastapi import Depends
from dotenv import load_dotenv
import os
from sqlalchemy.orm import DeclarativeBase

load_dotenv()
SECRET = os.getenv("SECRET")
DATABASE_URL = os.getenv("DATABASE_URL")
SCHEMA_SEARCH_PATH = os.getenv("SCHEMA_SEARCH_PATH")

class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    DATABASE_URL,
    connect_args={
        "server_settings": {
            "search_path": SCHEMA_SEARCH_PATH
        }
    },
    echo=True,
)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def create_db_and_tables():

    from app.models import user_model, exam_model, question_model, exam_session_model

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    from app.models.user_model import User
    from fastapi_users.db import SQLAlchemyUserDatabase
    yield SQLAlchemyUserDatabase(session, User)