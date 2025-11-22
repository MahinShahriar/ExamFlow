from typing import List
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from app.models.exam_model import Exam



async def _get_ordered_question_ids(session: AsyncSession, exam_id: UUID) -> List[UUID]:
    from ..models.exam_model import exam_questions
    stmt = select(exam_questions.c.question_id).where(exam_questions.c.exam_id == exam_id).order_by(exam_questions.c.order)
    res = await session.execute(stmt)
    rows = res.scalars().all()
    return rows


def _to_naive_utc(dt: datetime | None) -> datetime | None:
    """Convert an aware datetime to naive UTC (remove tzinfo). If already naive, assume UTC and return as-is.
    Returns None if input is None.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        # assume naive datetimes are already UTC
        return dt
    # convert to UTC and drop tzinfo
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _exam_to_read_dict(exam: Exam, question_ids: List[UUID]) -> dict:
    return {
        "id": exam.id,
        "title": exam.title,
        "start_time": exam.start_time,
        "end_time": exam.end_time,
        "duration": exam.duration,
        "is_published": exam.is_published,
        "questions": question_ids or [],
    }
