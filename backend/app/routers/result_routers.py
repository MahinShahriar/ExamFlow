# filepath: backend/app/routers/result_routers.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_async_session
from ..models.exam_session_model import ExamSession, ExamSessionStatus
from ..dependencies import current_admin
from ..security import current_active_user
from ..schemas.exam_session_schema import SessionResult

router = APIRouter()


@router.post('/student/results', response_model=List[SessionResult])
async def query_results(exam_id: Optional[str] = None, student_id: Optional[str] = None, session: AsyncSession = Depends(get_async_session), user = Depends(current_active_user)):
    """
    Query submitted exam sessions.
    - If called by admin and no filters provided -> return all submitted sessions.
    - If called by admin with filters -> apply them.
    - If called by student -> only return that student's submitted sessions (ignore other student_id values).
    """
    q = select(ExamSession).where(ExamSession.status == ExamSessionStatus.SUBMITTED)

    if exam_id:
        q = q.where(ExamSession.exam_id == exam_id)
    if student_id:
        # If caller is student, enforce same id
        try:
            if user.role.name == 'STUDENT':
                # only allow requesting own results
                q = q.where(ExamSession.student_id == user.id)
            else:
                q = q.where(ExamSession.student_id == student_id)
        except Exception:
            # default behavior: filter by provided student_id
            q = q.where(ExamSession.student_id == student_id)
    else:
        # if no student_id provided and caller is student, restrict to their id
        try:
            if user.role.name == 'STUDENT':
                q = q.where(ExamSession.student_id == user.id)
        except Exception:
            pass

    res = await session.execute(q)
    rows = res.scalars().all()

    out = []
    for r in rows:
        out.append({
            'id': r.id,
            'exam_id': r.exam_id,
            'student_id': r.student_id,
            'start_time': r.start_time,
            'status': r.status.value,
            'score': r.score,
            'question_scores': r.question_scores,
            'answers': r.answers,
            'remaining_seconds': r.remaining_seconds,
        })
    return out


@router.post('/student/results/grade')
async def grade_question(payload: dict, session: AsyncSession = Depends(get_async_session), admin = Depends(current_admin)):
    """
    Admin endpoint to update a single question score for a student's exam session.
    Expected payload: { "exam_id": <str>, "student_id": <str>, "question_id": <str>, "new_score": <number> }
    Returns the updated session object.
    """
    exam_id = payload.get('exam_id')
    student_id = payload.get('student_id')
    question_id = payload.get('question_id')
    new_score = payload.get('new_score')

    if not (exam_id and student_id and question_id) or new_score is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Missing payload fields')

    q = await session.execute(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == student_id))
    existing = q.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Session not found')

    # ensure question_scores is a dict
    if existing.question_scores is None:
        existing.question_scores = {}

    existing.question_scores[question_id] = float(new_score)

    # Recalculate total score
    total = 0.0
    try:
        for v in (existing.question_scores or {}).values():
            if v is None:
                continue
            total += float(v)
    except Exception:
        pass

    existing.score = total

    session.add(existing)
    await session.commit()
    await session.refresh(existing)

    return {
        'id': existing.id,
        'exam_id': existing.exam_id,
        'student_id': existing.student_id,
        'start_time': existing.start_time,
        'status': existing.status.value,
        'score': existing.score,
        'question_scores': existing.question_scores,
        'answers': existing.answers,
        'remaining_seconds': existing.remaining_seconds,
    }

