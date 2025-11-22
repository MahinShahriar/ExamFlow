from ..models.exam_model import exam_questions
from ..models.question_model import QuestionDB
from  sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List


async def _get_exam_qids(session: AsyncSession, exam_id):
    qstmt = select(exam_questions.c.question_id).where(exam_questions.c.exam_id == exam_id).order_by(exam_questions.c.order)
    qres = await session.execute(qstmt)
    return qres.scalars().all()


async def _get_questions_for_exam(session: AsyncSession, qids: List[str]):
    if not qids:
        return []
    qstmt = select(QuestionDB).where(QuestionDB.id.in_(qids))
    qres = await session.execute(qstmt)
    # Preserve order from qids
    qmap = {str(q.id): q for q in qres.scalars().all()}
    ordered = [qmap[str(qid)] for qid in qids if str(qid) in qmap]
    return ordered


def _sanitize_question(q: QuestionDB):
    # remove correct_answers field to prevent leaking
    return {
        'id': q.id,
        'title': q.title,
        'description': q.description,
        'complexity': q.complexity,
        'type': q.type,
        'options': q.options,
        'max_score': q.max_score,
        'tags': q.tags,
    }