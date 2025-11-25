from app.db import Base
from sqlalchemy import Column, Integer, Float, DateTime, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship, backref
from sqlalchemy.ext.mutable import MutableDict
import uuid
import enum
from datetime import datetime


class ExamSessionStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"


class ExamSession(Base):
    __tablename__ = "exam_sessions"
    __table_args__ = (UniqueConstraint('exam_id', 'student_id', name='uq_exam_student'),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # ensure exam_id is a proper foreign key so DB-level ON DELETE CASCADE can remove sessions
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    start_time = Column(DateTime, default=datetime.utcnow)
    status = Column(SAEnum(ExamSessionStatus), default=ExamSessionStatus.IN_PROGRESS, nullable=False)
    score = Column(Float, nullable=True)

    # use MutableDict so SQLAlchemy detects in-place changes to JSON fields
    answers = Column(MutableDict.as_mutable(JSONB), nullable=True, default=dict)
    question_scores = Column(MutableDict.as_mutable(JSONB), nullable=True, default=dict)
    remaining_seconds = Column(Integer, nullable=True)
    # Use a backref with passive_deletes so SQLAlchemy will not try to nullify the FK when deleting the parent
    exam = relationship("Exam", backref=backref("sessions", passive_deletes=True))
