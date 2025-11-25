from app.db import Base
import uuid
from sqlalchemy import Column, Integer, String, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY # PostgreSQL specific imports
from sqlalchemy.orm import relationship


class QuestionDB(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    complexity = Column(String, nullable=False)

    type = Column(Enum('single_choice', 'multi_choice', 'text', 'image_upload', name='question_type'),
                  nullable=False)
    options = Column(JSONB, nullable=True)
    correct_answers = Column(JSONB, nullable=True)
    max_score = Column(Integer, default=1)
    tags = Column(JSONB, nullable=True)









