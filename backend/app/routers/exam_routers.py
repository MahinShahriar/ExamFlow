from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID
from sqlalchemy import select, insert, delete
from sqlalchemy.ext.asyncio import AsyncSession


from ..db import get_async_session
from ..models.exam_model import Exam
from ..schemas.exam_schema import ExamCreate, ExamRead, ExamUpdate
from starlette.responses import Response
from  ..services.exam_service import _get_ordered_question_ids, _exam_to_read_dict, _to_naive_utc
from  ..dependencies import current_admin, current_student
from ..security import current_active_user

router = APIRouter(prefix="/exams", tags=["Exams"])



@router.get("/", response_model=List[ExamRead], dependencies=[Depends(current_admin)])
async def get_all_exams(session: AsyncSession = Depends(get_async_session), user=Depends(current_active_user)):
    result = await session.execute(select(Exam))
    exams = result.scalars().all()
    exam_list = []
    if exams:
        for exam in exams:
            qids = await _get_ordered_question_ids(session, exam.id)
            exam_list.append(_exam_to_read_dict(exam, qids))
    else:
        return []
    return exam_list


@router.post("/", response_model=ExamRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(current_admin)])
async def create_exam(payload: ExamCreate, session: AsyncSession = Depends(get_async_session)):
    # create exam and link questions in the order provided
    from ..models.exam_model import exam_questions
    from ..models.question_model import QuestionDB

    # Normalize times to naive UTC to match DB
    start_time = _to_naive_utc(payload.start_time)
    end_time = _to_naive_utc(payload.end_time)

    exam = Exam(
        title=payload.title,
        start_time=start_time,
        end_time=end_time,
        duration=payload.duration,
        is_published=payload.is_published if hasattr(payload, 'is_published') else False,
    )
    session.add(exam)
    await session.flush()

    if payload.questions:
        # check duplicate IDs
        if len(set(payload.questions)) != len(payload.questions):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate question IDs are not allowed")

        # verify question ids exist
        qstmt = select(QuestionDB).where(QuestionDB.id.in_(payload.questions))
        qres = await session.execute(qstmt)
        questions = qres.scalars().all()
        if len(questions) != len(payload.questions):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more question IDs are invalid")

        rows = []
        for idx, qid in enumerate(payload.questions):
            rows.append({"exam_id": exam.id, "question_id": qid, "order": idx})

        await session.execute(insert(exam_questions), rows)

    await session.commit()
    await session.refresh(exam)

    qids = await _get_ordered_question_ids(session, exam.id)
    return _exam_to_read_dict(exam, qids)


@router.get("/{exam_id}", response_model=ExamRead, dependencies=[Depends(current_active_user)])
async def get_exam(exam_id: UUID, session: AsyncSession = Depends(get_async_session), user=Depends(current_active_user)):

    #  get single exam. Students see only published exam.

    if user.role.name == "STUDENT":
        result = await session.execute(select(Exam).where(Exam.id == exam_id, Exam.is_published == True))
    else:
        result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    qids = await _get_ordered_question_ids(session, exam.id)
    return _exam_to_read_dict(exam, qids)


@router.put("/{exam_id}", response_model=ExamRead, dependencies=[Depends(current_admin)])
async def update_exam(exam_id: UUID, payload: ExamUpdate, session: AsyncSession = Depends(get_async_session)):
    # update only fields sent and replace question order if provided
    from ..models.exam_model import exam_questions
    from ..models.question_model import QuestionDB

    result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if payload.title is not None:
        exam.title = payload.title
    if payload.start_time is not None:
        exam.start_time = _to_naive_utc(payload.start_time)
    if payload.end_time is not None:
        exam.end_time = _to_naive_utc(payload.end_time)
    if payload.duration is not None:
        exam.duration = payload.duration
    if payload.is_published is not None:
        exam.is_published = payload.is_published

    session.add(exam)
    await session.flush()

    if payload.questions is not None:
        # validate
        if payload.questions:
            if len(set(payload.questions)) != len(payload.questions):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate question IDs are not allowed")

            qstmt = select(QuestionDB).where(QuestionDB.id.in_(payload.questions))
            qres = await session.execute(qstmt)
            questions = qres.scalars().all()
            if len(questions) != len(payload.questions):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more question IDs are invalid")

        # delete previous links
        await session.execute(delete(exam_questions).where(exam_questions.c.exam_id == exam.id))

        # insert new links with order
        if payload.questions:
            rows = []
            for idx, qid in enumerate(payload.questions):
                rows.append({"exam_id": exam.id, "question_id": qid, "order": idx})
            await session.execute(insert(exam_questions), rows)

    await session.commit()
    await session.refresh(exam)

    qids = await _get_ordered_question_ids(session, exam.id)
    return _exam_to_read_dict(exam, qids)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(current_admin)])
async def delete_exam(exam_id: UUID, session: AsyncSession = Depends(get_async_session)):
    # delete exam and its question links
    from ..models.exam_model import exam_questions
    from ..models.exam_session_model import ExamSession

    result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # delete associated exam sessions first to avoid FK constraint issues
    await session.execute(delete(ExamSession).where(ExamSession.exam_id == exam.id))

    # delete exam-question links
    await session.execute(delete(exam_questions).where(exam_questions.c.exam_id == exam.id))
    await session.commit()

    # delete the exam record
    await session.delete(exam)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{exam_id}/publish", response_model=ExamRead, dependencies=[Depends(current_admin)])
async def publish_exam(exam_id: UUID, session: AsyncSession = Depends(get_async_session)):
    # set exam.is_published = True
    result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    await session.refresh(exam)
    try:
        qids = await _get_ordered_question_ids(session, exam.id)
    except Exception as e:
        print("\n\n\nError fetching question IDs:", e, "\n\n\n")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error fetching question IDs")

    if len(qids) == 0:
        print("\n\n\nNo questions linked to exam\n\n\n")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot publish exam with no questions")
    exam.is_published = True
    session.add(exam)
    await session.commit()
    await session.refresh(exam)
    qids = await _get_ordered_question_ids(session, exam.id)
    return _exam_to_read_dict(exam, qids)


@router.post("/{exam_id}/unpublish", response_model=ExamRead, dependencies=[Depends(current_admin)])
async def unpublish_exam(exam_id: UUID, session: AsyncSession = Depends(get_async_session)):
    # set exam.is_published = False
    result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    exam.is_published = False
    session.add(exam)
    await session.commit()
    await session.refresh(exam)
    qids = await _get_ordered_question_ids(session, exam.id)
    return _exam_to_read_dict(exam, qids)
