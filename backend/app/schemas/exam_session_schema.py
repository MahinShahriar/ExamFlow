from pydantic import BaseModel
from typing import Optional, Dict
from uuid import UUID
from datetime import datetime


class SessionCreateResponse(BaseModel):
    id: UUID
    exam_id: UUID
    student_id: UUID
    start_time: datetime
    status: str
    remaining_seconds: Optional[int]
    answers: Optional[Dict[str, object]] = {}

    class Config:
        orm_mode = True


class SessionAutoSave(BaseModel):
    answers: Optional[Dict[str, object]] = None
    remaining_seconds: Optional[int] = None


class SubmitPayload(BaseModel):
    answers: Optional[Dict[str, object]] = None


class SessionResult(BaseModel):
    id: UUID
    exam_id: UUID
    student_id: UUID
    start_time: datetime
    status: str
    score: Optional[float]
    question_scores: Optional[Dict[str, Optional[float]]]
    answers: Optional[Dict[str, object]]
    remaining_seconds: Optional[int]

    class Config:
        orm_mode = True

