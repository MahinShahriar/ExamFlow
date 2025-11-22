from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from typing import List
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, String

from ..db import get_async_session
from ..dependencies import current_admin
from ..schemas.question_schema import QuestionData
from ..services.excel_service import parse_excel

router = APIRouter(prefix="/questionbank", tags=["Question Bank"])


# Upload Excel & Preview
@router.post("/upload", dependencies=[Depends(current_admin)])
async def upload_excel(file: UploadFile = File(...)):
    #  check file extension and return parsed preview
    file_extension = os.path.splitext(file.filename)[1]  # file extension
    allowed_extension = {".xlsx", ".xlsm", ".xls", ".xlsb", ".ods"}

    # Check if the extension is allowed
    if file_extension not in allowed_extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension. Only {allowed_extension} are allowed."
        )
    try:
        preview = parse_excel(file.file)
    except KeyError as e:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Column not found :{str(e)}. Please check the column in uploaded file. "
                "file must contain these columns [title, description, complexity, type, options(json),"
                "correct_answers(json), max_score, tags(csv)]. Columns are case sensitive, so remove spaces or unusual characters from columns."
            ),
        )

    return {"total": len(preview), "preview": preview}


# Confirm Import
@router.post("/confirm-import", dependencies=[Depends(current_admin)])
async def confirm_import(
    questions: List[QuestionData],
    session: AsyncSession = Depends(get_async_session),
):
    #  save parsed questions into DB if not duplicate
    from ..models.question_model import QuestionDB

    total_questions = 0
    for q in questions:
        existing = await session.execute(select(QuestionDB).where(QuestionDB.title == q.title))
        existing_question = existing.scalar_one_or_none()

        if existing_question:
            # Skip duplicate
            print(f"'{q.title}' question already exists in database. so it skipped ! ")
            continue
        try:
            question = QuestionDB(
                title=q.title,
                description=q.description,
                complexity=q.complexity,
                type=q.type,
                options=q.options,
                correct_answers=q.correct_answers,
                max_score=q.max_score,
                tags=q.tags,
            )

            session.add(question)
            total_questions += 1
        except Exception as e:
            print(f"Skipping row due to error: {e}")
            continue

    await session.commit()

    return {"message": f"{total_questions} questions saved successfully!"}


@router.get("/list")
async def list_questions(
    search: str = "",
    tags: str = "",
    complexity: str = "",
    page: int = 1,
    per_page: int = 20,
    session: AsyncSession = Depends(get_async_session),
):
    # list and filter questions with pagination
    from ..models.question_model import QuestionDB

    stmt = select(QuestionDB)

    if search:
        stmt = stmt.where(func.lower(QuestionDB.title).like(f"%{search.lower().strip()}%"))

    if tags:
        stmt = stmt.where(func.lower(QuestionDB.tags.cast(String)).like(f'%"{tags.lower().strip()}"%'))

    if complexity:
        stmt = stmt.where(func.lower(QuestionDB.complexity).like(f"%{complexity.lower().strip()}%"))

    try:
        count_stmt = select(func.count()).select_from(QuestionDB)
        if search:
            count_stmt = count_stmt.where(func.lower(QuestionDB.title).like(f"%{search.lower().strip()}%"))
        if tags:
            count_stmt = count_stmt.where(func.lower(QuestionDB.tags.cast(String)).like(f'%"{tags.lower().strip()}"%'))
        if complexity:
            count_stmt = count_stmt.where(func.lower(QuestionDB.complexity).like(f"%{complexity.lower().strip()}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar_one() or 0

        if page < 1:
            page = 1
        if per_page < 1:
            per_page = 20

        stmt = stmt.offset((page - 1) * per_page).limit(per_page)
        result = await session.execute(stmt)
        questions = result.scalars().all()

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{e}")

    return {"items": questions, "total": int(total)}


@router.get("/{question_id}")
async def get_question(question_id, session: AsyncSession = Depends(get_async_session)):
    # return a single question or 404
    from ..models.question_model import QuestionDB

    try:
        result = await session.execute(select(QuestionDB).where(QuestionDB.id == question_id))
        question = result.scalar_one_or_none()
    except Exception:
        raise HTTPException(status_code=404, detail="Question not found.")

    if not question:
        raise HTTPException(status_code=404, detail="Question not found.")

    return question
