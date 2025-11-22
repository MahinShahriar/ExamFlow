from pydantic import BaseModel, Field, conlist, validator
from typing import List, Union, Optional, TypeVar
import enum

class QuestionType(str, enum.Enum):
    """Enums for valid question types."""
    single_choice = "single_choice"
    multi_choice = "multi_choice"
    text = "text"
    image_upload = "image_upload"

AnswerContent = Union[int, float, str]

class QuestionData(BaseModel):
    """
    Schema for validating a new question data object.

    This model strictly validates the structure of the incoming JSON payload.
    """
    title: str = Field(..., description="The main title or text of the question.")
    description: Optional[str] = Field(..., description="A detailed explanation or context for the question.")
    complexity: str = Field(..., description="The difficulty level (e.g., 'Class 1', 'Expert').")
    type: QuestionType = Field(...,
                               description="The type of question (single_choice, multi_choice, text, image_upload).")

    options: List[AnswerContent] = Field(default_factory=list,
                                         description="A list of possible answer options for choice-based questions.")

    correct_answers: Optional[Union[AnswerContent, List[AnswerContent]]] = None

    max_score: int = Field(..., gt=0, description="The maximum score awarded for a correct answer.")

    # Tags are a list of strings (e.g., ["Geography", "Europe"])
    tags: List[str] = Field(default_factory=list, description="A list of keywords/tags for categorization.")

    @validator('correct_answers', always=True)
    def validate_answers_based_on_type(cls, v, values):
        """
        Custom validator to ensure 'correct_answers' matches the 'type' field.

        - single_choice: Must be a string and one of the options.
        - multi_choice: Must be a list of strings, and all elements must be in options.
        - text/image_upload: Can be None or a simple string/list.
        """
        q_type = values.get('type')
        options = values.get('options', [])

        if q_type == QuestionType.single_choice:
            if not isinstance(v, str):
                raise ValueError('Single choice must have a single string correct answer.')
            if v and v not in options:
                raise ValueError('Single choice answer must be one of the provided options.')

        elif q_type == QuestionType.multi_choice:
            if not isinstance(v, list):
                raise ValueError('Multi choice must have a list of correct answers.')
            if any(ans not in options for ans in v):
                raise ValueError('All multi choice answers must be contained within the options list.')
        return v


class QuestionResponse(QuestionData):
    id: str = Field(..., description="Unique identifier for the question.")