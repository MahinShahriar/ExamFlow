# filepath: backend/app/routers/exam_routers.py
#  routes for exam CRUD and publish/unpublish
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



@router.get("/", response_model=List[ExamRead], dependencies=[Depends(current_active_user)])
async def get_all_exams(session: AsyncSession = Depends(get_async_session), user=Depends(current_active_user)):
    # return all exams. Students only get published exams.
    print(user.role, "\n\n\n")
    if user.role.name == "STUDENT":
        stmt = select(Exam).where(Exam.is_published == True)
    else:
        stmt = select(Exam)
    result = await session.execute(stmt)
    exams = result.scalars().all()

    out = []
    for ex in exams:
        qids = await _get_ordered_question_ids(session, ex.id)
        out.append(_exam_to_read_dict(ex, qids))
    return out


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
    print(user.role, "\n\n")


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

    result = await session.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    await session.execute(delete(exam_questions).where(exam_questions.c.exam_id == exam.id))
    await session.commit()
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
