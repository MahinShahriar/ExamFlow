"""Table:
ExamSessions (Submissions)
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `exam_id` | UUID | FK -> Exams |
| `student_id` | UUID | FK -> Users-> user.role==STUDENT |
| `start_time` | TIMESTAMP | When student clicked "Start" |
| `status` | ENUM | `'in_progress'`, `'submitted'` |
| `score` | FLOAT | Total calculated score |
| `answers` | JSONB | Map: `{ "question_id": "user_answer_value" }` |
| `question_scores` | JSONB | Map: `{ "question_id": score_int }` |
| `remaining_seconds`| INTEGER | For tracking timer on resume |
"""

from app.db import Base
from sqlalchemy import Column, Integer, Float, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime


class ExamSessionStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    start_time = Column(DateTime, default=datetime.utcnow)
    status = Column(SAEnum(ExamSessionStatus), default=ExamSessionStatus.IN_PROGRESS, nullable=False)
    score = Column(Float, nullable=True)

    answers = Column(JSONB, nullable=True, default=dict)
    question_scores = Column(JSONB, nullable=True, default=dict)
    remaining_seconds = Column(Integer, nullable=True)
    exam = relationship("Exam", backref="sessions")
