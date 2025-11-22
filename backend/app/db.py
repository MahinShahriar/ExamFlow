from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from fastapi import Depends
from app.config import DATABASE_URL, SCHEMA_SEARCH_PATH

# Define a single Declarative Base here so all models share the same metadata
from sqlalchemy.orm import DeclarativeBase


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
    # Import models here so they register with the shared Base.metadata
    # Importing inside the function avoids circular imports at module import time
    # Ensure exam_model is imported before question_model so association tables
    # like `exam_questions` are present when QuestionDB is mapped.
    from app.models import user_model, exam_model, question_model, exam_session_model, result_model  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    # Import User lazily to avoid circular imports
    from app.models.user_model import User
    from fastapi_users.db import SQLAlchemyUserDatabase
    yield SQLAlchemyUserDatabase(session, User)