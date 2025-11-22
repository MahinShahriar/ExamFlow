from app.db import Base
from sqlalchemy import String


"""
Exams Model and ExamQuestions Junction Table
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `title` | VARCHAR | |
| `start_time` | TIMESTAMP | ISO 8601 UTC |
| `end_time` | TIMESTAMP | ISO 8601 UTC |
| `duration` | INTEGER | In minutes |
| `is_published` | BOOLEAN | Default `false` |

### 4. ExamQuestions (Junction)
| Column | Type | Notes |
| :--- | :--- | :--- |
| `exam_id` | UUID | FK -> Exams |
| `question_id` | UUID | FK -> Questions |
| `order` | INTEGER | To maintain sequence in exam |
"""

from sqlalchemy import Column, Boolean, Integer, DateTime, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
import uuid


# Association (junction) table between exams and questions
exam_questions = Table(
    "exam_questions",
    Base.metadata,
    Column("exam_id", UUID(as_uuid=True), ForeignKey("exams.id"), primary_key=True),
    Column("question_id", UUID(as_uuid=True), ForeignKey("questions.id"), primary_key=True),
    Column("order", Integer, nullable=False),
)


class Exam(Base):
    __tablename__ = "exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=False)  # in minutes
    is_published = Column(Boolean, default=False)
    questions = relationship(
        "QuestionDB",
        secondary=exam_questions,
        backref=backref("exams"),
        order_by=exam_questions.c.order,
    )
"""
The Example,

sample_exam = Exam(
    title="Sample Exam",
    start_time=datetime(2024, 7, 1, 10, 0, 0),
    end_time=datetime(2024, 7, 1, 12, 0, 0),
    duration=120,
    is_published=True
)
sample_exam.questions = [question1, question2, question3]

sample_exam.title  # "Sample Exam"
sample_exam.duration  # 120
sample_exam.is_published  # False
sample_exam.questions  # [question1, question2, question3]
sample_exam.end_time  # datetime object representing end time


"""
