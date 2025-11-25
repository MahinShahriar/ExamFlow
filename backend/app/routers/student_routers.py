from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from typing import List
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
import os
import uuid
import logging

from ..db import get_async_session
from ..dependencies import current_student
from ..models.exam_model import Exam, exam_questions
from ..models.question_model import QuestionDB
from ..models.exam_session_model import ExamSession, ExamSessionStatus

logger = logging.getLogger(__name__)


from ..schemas.exam_schema import ExamRead
from ..schemas.exam_session_schema import SessionCreateResponse, SessionAutoSave, SubmitPayload, SessionResult
from ..services.grading_service import grade_submission
from ..services.session_service import _get_exam_qids, _get_questions_for_exam, _sanitize_question

router = APIRouter()


@router.get("/student/exams", response_model=List[ExamRead], dependencies=[Depends(current_student)])
async def list_published_exams(session: AsyncSession = Depends(get_async_session)):
    now = datetime.utcnow()
    stmt = select(Exam).where(Exam.is_published == True)
    # only include exams within start/end if they are set
    stmt = stmt.where(
        ((Exam.start_time == None) | (Exam.start_time <= now)) & ((Exam.end_time == None) | (Exam.end_time >= now))
    )
    res = await session.execute(stmt)
    exams = res.scalars().all()

    # Return ExamRead form (questions are lists of UUIDs)
    out = []
    for ex in exams:
        # get ordered question ids
        qstmt = select(exam_questions.c.question_id).where(exam_questions.c.exam_id == ex.id).order_by(exam_questions.c.order)
        qres = await session.execute(qstmt)
        qids = qres.scalars().all()
        out.append({
            'id': ex.id,
            'title': ex.title,
            'start_time': ex.start_time,
            'end_time': ex.end_time,
            'duration': ex.duration,
            'is_published': ex.is_published,
            'questions': qids or [],
        })
    return out


@router.post("/exams/{exam_id}/start", response_model=SessionCreateResponse)
async def start_exam(exam_id: str, user = Depends(current_student), session: AsyncSession = Depends(get_async_session)):
    # Ensure exam exists and is published/available
    now = datetime.utcnow()
    res = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = res.scalar_one_or_none()
    if not exam or not exam.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not available")
    if exam.start_time and exam.start_time > now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam has not started yet")
    if exam.end_time and exam.end_time < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam has ended")


    # Check for any existing session for this student & exam
    q = await session.execute(
        select(ExamSession).where(ExamSession.exam_id == exam.id, ExamSession.student_id == user.id)
    )

    existing_rows = q.scalars().all()
    if len(existing_rows) > 1:
        logger.warning("Multiple ExamSession rows found for exam_id=%s student_id=%s — using first row", str(exam.id), str(user.id))
    existing = existing_rows[0] if existing_rows else None
    if existing:
        if existing.status == ExamSessionStatus.IN_PROGRESS:
            # Resume existing in-progress session
            qids = await _get_exam_qids(session, exam.id)
            questions = await _get_questions_for_exam(session, qids)
            sanitized_questions = [_sanitize_question(q) for q in questions]
            return {
                'id': existing.id,
                'exam_id': existing.exam_id,
                'student_id': existing.student_id,
                'start_time': existing.start_time,
                'status': existing.status.value,
                'remaining_seconds': existing.remaining_seconds,
                'answers': existing.answers or {},
                'questions': sanitized_questions,
            }
        else:
            # already submitted
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already submitted this exam")

    #  new session
    new_session = ExamSession(exam_id=exam.id, student_id=user.id)
    session.add(new_session)
    await session.flush()

    # compute remaining_seconds default (duration * 60) if not provided
    new_session.remaining_seconds = exam.duration * 60 if exam.duration else None

    try:
        await session.commit()
        await session.refresh(new_session)
        created_session = new_session
    except IntegrityError:
        await session.rollback()
        q2 = await session.execute(
            select(ExamSession).where(ExamSession.exam_id == exam.id, ExamSession.student_id == user.id)
        )
        rows2 = q2.scalars().all()
        if len(rows2) > 1:
            logger.warning("Multiple ExamSession rows found after IntegrityError for exam_id=%s student_id=%s — using first row", str(exam.id), str(user.id))
        created_session = rows2[0] if rows2 else None
        if not created_session:
            raise

    # fetchs questions and returns them (without correct_answers)
    qids = await _get_exam_qids(session, exam.id)
    questions = await _get_questions_for_exam(session, qids)
    sanitized_questions = [_sanitize_question(q) for q in questions]

    if not created_session:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create or retrieve exam session")

    return {
        'id': created_session.id,
        'exam_id': created_session.exam_id,
        'student_id': created_session.student_id,
        'start_time': created_session.start_time,
        'status': created_session.status.value,
        'remaining_seconds': created_session.remaining_seconds,
        'answers': created_session.answers or {},
        'questions': sanitized_questions,
    }


@router.put("/exams/{exam_id}/session")
async def autosave_session(exam_id: str, payload: SessionAutoSave, user = Depends(current_student), session: AsyncSession = Depends(get_async_session)):
    print(f"\n\n\n\n\n\n User: {user.email} \nSession: {session.info}\n\n\n\n\n\n")
    try:
        # basic validation of payload types to avoid server errors
        if payload.answers is not None and not isinstance(payload.answers, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload: 'answers' must be an object/dictionary")
        if payload.remaining_seconds is not None and not isinstance(payload.remaining_seconds, int):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload: 'remaining_seconds' must be an integer")

        # find in-progress session
        q = await session.execute(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == user.id, ExamSession.status == ExamSessionStatus.IN_PROGRESS))
        rows = q.scalars().all()
        if len(rows) > 1:
            logger.warning("Multiple in-progress ExamSession rows found for exam_id=%s student_id=%s — using first row", str(exam_id), str(user.id))
        existing = rows[0] if rows else None
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        if payload.answers is not None:
            existing.answers = payload.answers
        if payload.remaining_seconds is not None:
            existing.remaining_seconds = payload.remaining_seconds

        try:
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
        except IntegrityError as ie:
            await session.rollback()
            logger.exception("DB IntegrityError while autosaving session for exam_id=%s student_id=%s: %s", str(exam_id), str(getattr(user, 'id', None)), ie)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database error while saving session")

        return { 'ok': True }
    except HTTPException:
        # re-raise HTTPExceptions (404/400 etc.)
        raise
    except Exception as e:
        logger.exception("Error while autosaving session for exam_id=%s student_id=%s: %s", str(exam_id), str(getattr(user, 'id', None)), e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/exams/{exam_id}/submit", response_model=SessionResult)
async def submit_exam(exam_id: str, payload: SubmitPayload, user = Depends(current_student), session: AsyncSession = Depends(get_async_session)):
    try:
        # validate payload
        if payload.answers is not None and not isinstance(payload.answers, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload: 'answers' must be an object/dictionary")

        # get in-progress session
        q = await session.execute(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == user.id, ExamSession.status == ExamSessionStatus.IN_PROGRESS))
        rows = q.scalars().all()
        if len(rows) > 1:
            logger.warning("Multiple in-progress ExamSession rows found for exam_id=%s student_id=%s — using first row", str(exam_id), str(user.id))
        existing = rows[0] if rows else None
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        # merge answers
        answers = existing.answers or {}
        if payload.answers:
            # ensure keys are strings (JSONB keys must be strings)
            safe_answers = {}
            for k, v in payload.answers.items():
                safe_answers[str(k)] = v
            answers.update(safe_answers)

        # fetch exam questions
        qids = await _get_exam_qids(session, exam_id)
        questions = await _get_questions_for_exam(session, qids)

        # auto-grade objective questions
        question_scores, total = grade_submission(answers, questions)

        existing.answers = answers
        existing.question_scores = question_scores
        existing.score = total
        existing.status = ExamSessionStatus.SUBMITTED
        existing.remaining_seconds = 0

        try:
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
        except IntegrityError as ie:
            await session.rollback()
            logger.exception("DB IntegrityError while submitting session for exam_id=%s student_id=%s: %s", str(exam_id), str(getattr(user, 'id', None)), ie)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database error while submitting session")

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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error while submitting session for exam_id=%s student_id=%s: %s", str(exam_id), str(getattr(user, 'id', None)), e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/student/results", response_model=List[SessionResult])
async def get_student_results(user = Depends(current_student), session: AsyncSession = Depends(get_async_session)):
    res = await session.execute(select(ExamSession).where(ExamSession.student_id == user.id, ExamSession.status == ExamSessionStatus.SUBMITTED))
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


@router.post("/media/upload")
async def upload_media(request: Request, file: UploadFile = File(...), user = Depends(current_student)):
    """Accept an uploaded file (image) and save under the project's media/ directory. Returns a public URL."""
    try:
        media_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'media'))
        os.makedirs(media_dir, exist_ok=True)

        _, ext = os.path.splitext(file.filename or '')
        if not ext:
            ext = '.bin'
        fname = f"{uuid.uuid4().hex}{ext}"
        dest_path = os.path.join(media_dir, fname)
        with open(dest_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        return { 'url': f"/media/{fname}" }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
