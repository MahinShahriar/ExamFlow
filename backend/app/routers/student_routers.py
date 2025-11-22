from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from typing import List
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import os
import uuid

from ..db import get_async_session
from ..dependencies import current_student
from ..models.exam_model import Exam, exam_questions
from ..models.question_model import QuestionDB
from ..models.exam_session_model import ExamSession, ExamSessionStatus
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
    existing = q.scalar_one_or_none()
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
            # Student already submitted this exam; do not allow starting again
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already submitted this exam")

    # create new session
    new_session = ExamSession(exam_id=exam.id, student_id=user.id)
    session.add(new_session)
    await session.flush()

    # compute remaining_seconds default (duration * 60) if not provided
    new_session.remaining_seconds = exam.duration * 60 if exam.duration else None

    await session.commit()
    await session.refresh(new_session)

    # fetch questions and return them (without correct_answers)
    qids = await _get_exam_qids(session, exam.id)
    questions = await _get_questions_for_exam(session, qids)
    sanitized_questions = [_sanitize_question(q) for q in questions]

    return {
        'id': new_session.id,
        'exam_id': new_session.exam_id,
        'student_id': new_session.student_id,
        'start_time': new_session.start_time,
        'status': new_session.status.value,
        'remaining_seconds': new_session.remaining_seconds,
        'answers': new_session.answers or {},
        'questions': sanitized_questions,
    }


@router.put("/exams/{exam_id}/session")
async def autosave_session(exam_id: str, payload: SessionAutoSave, user = Depends(current_student), session: AsyncSession = Depends(get_async_session)):
    # find in-progress session
    q = await session.execute(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == user.id, ExamSession.status == ExamSessionStatus.IN_PROGRESS))
    existing = q.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if payload.answers is not None:
        existing.answers = payload.answers
    if payload.remaining_seconds is not None:
        existing.remaining_seconds = payload.remaining_seconds

    await session.add(existing)
    await session.commit()
    await session.refresh(existing)
    return { 'ok': True }


@router.post("/exams/{exam_id}/submit", response_model=SessionResult)
async def submit_exam(exam_id: str, payload: SubmitPayload, user = Depends(current_student), session: AsyncSession = Depends(get_async_session)):
    # get in-progress session
    q = await session.execute(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == user.id, ExamSession.status == ExamSessionStatus.IN_PROGRESS))
    existing = q.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # merge answers
    answers = existing.answers or {}
    if payload.answers:
        answers.update(payload.answers)

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

    await session.add(existing)
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
async def upload_media(file: UploadFile = File(...), user = Depends(current_student)):
    """Accept an uploaded file (image) and save under the project's media/ directory. Returns a public URL."""
    try:
        # ensure media directory exists (app.py creates it on startup but double-check)
        base_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
        media_dir = os.path.join(base_dir, 'media')
        os.makedirs(media_dir, exist_ok=True)

        # derive filename
        _, ext = os.path.splitext(file.filename or '')
        # fallback extension for unknown
        if not ext:
            ext = '.bin'
        fname = f"{uuid.uuid4().hex}{ext}"
        dest_path = os.path.join(media_dir, fname)

        # write file to disk
        with open(dest_path, 'wb') as f:
            content = await file.read()
            f.write(content)

        # return URL relative to server root (StaticFiles mounted at /media)
        url = f"/media/{fname}"
        return { 'url': url }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
