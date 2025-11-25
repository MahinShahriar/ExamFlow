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

    # find the session
    q = await session.execute(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == student_id))
    existing = q.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Session not found')

    # import QuestionDB to validate max_score and question type
    from ..models.question_model import QuestionDB

    # make sure question exists and read its max_score
    qres = await session.execute(select(QuestionDB).where(QuestionDB.id == question_id))
    question = qres.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Question not found')

    try:
        ns = float(new_score)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='new_score must be a number')

    # validate bounds
    max_score = float(question.max_score or 0)
    if ns < 0 or ns > max_score:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'new_score must be between 0 and {max_score}')

    # ensure question_scores is a dict
    if existing.question_scores is None:
        existing.question_scores = {}

    # update the single question's manual score
    # assign into a new dict to ensure SQLAlchemy change detection (avoid subtle mutation issues)
    new_qscores = dict(existing.question_scores or {})
    new_qscores[str(question_id)] = ns

    # We want to recompute the total score by combining auto-graded answers and manual scores.
    # Collect all question ids referenced either in answers or in question_scores
    qids = set()
    if existing.answers:
        try:
            qids.update([str(k) for k in existing.answers.keys()])
        except Exception:
            pass
    qids.update([str(k) for k in new_qscores.keys()])

    # fetch all question rows we need
    if qids:
        q_all = await session.execute(select(QuestionDB).where(QuestionDB.id.in_(list(qids))))
        questions = q_all.scalars().all()
    else:
        questions = []

    # build map
    qmap = {str(q.id): q for q in questions}

    # compute combined question_scores: for auto-gradable compute from answers, for manual use new_qscores value (may be None)
    combined_scores = {}
    total = 0.0
    for qid in qids:
        qq = qmap.get(qid)
        # default score None
        score_value = None
        if qq is None:
            # unknown question, skip
            continue
        if qq.type in ("single_choice", "multi_choice"):
            # compute auto-grade
            ans = None
            if existing.answers:
                ans = existing.answers.get(qid)
            try:
                if qq.type == "single_choice":
                    if ans is not None and ans == qq.correct_answers:
                        score_value = float(qq.max_score or 0)
                    else:
                        score_value = 0.0
                else:
                    # multi_choice: require set equality
                    if ans is not None and isinstance(ans, (list, tuple)) and isinstance(qq.correct_answers, (list, tuple)):
                        if set(ans) == set(qq.correct_answers):
                            score_value = float(qq.max_score or 0)
                        else:
                            score_value = 0.0
                    else:
                        score_value = 0.0
            except Exception:
                score_value = 0.0
        else:
            # manual-graded question: prefer the manually provided score (if present), else None
            if str(qid) in new_qscores:
                val = new_qscores.get(str(qid))
                score_value = float(val) if val is not None else None
            else:
                score_value = None

        combined_scores[str(qid)] = score_value
        if score_value is not None:
            try:
                total += float(score_value)
            except Exception:
                pass

    # write back combined_scores and total
    existing.question_scores = combined_scores
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
