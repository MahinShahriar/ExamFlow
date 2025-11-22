from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class ExamCreate(BaseModel):
    title: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: int
    is_published: bool = None
    # Selected question IDs; the order in the list defines the exam order
    questions: Optional[List[UUID]] = None

    @validator("duration")
    def duration_must_be_positive(cls, v):
        if v is None or v <= 0:
            raise ValueError("duration must be a positive integer (minutes)")
        return v

    @validator("end_time")
    def end_after_start(cls, v, values):
        start = values.get("start_time")
        if v is not None and start is not None and v <= start:
            raise ValueError("end_time must be after start_time")
        return v


class ExamUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: Optional[int] = None
    is_published: Optional[bool] = None
    # Replace or reorder questions when provided
    questions: Optional[List[UUID]] = None

    @validator("duration")
    def duration_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("duration must be a positive integer (minutes)")
        return v

    @validator("end_time")
    def end_after_start(cls, v, values):
        start = values.get("start_time")
        if v is not None and start is not None and v <= start:
            raise ValueError("end_time must be after start_time")
        return v


class ExamRead(BaseModel):
    id: UUID
    title: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: int
    is_published: bool
    # Include ordered list of question IDs for the exam
    questions: List[UUID] = []

    class Config:
        orm_mode = True
