import pytest
import uuid
from ..app.services.grading_service import grade_submission


class DummyQuestion:
    def __init__(self, id, type, correct_answers, max_score=1):
        self.id = id
        self.type = type
        self.correct_answers = correct_answers
        self.max_score = max_score


def test_single_choice_correct_and_incorrect():
    q = DummyQuestion(id=1, type="single_choice", correct_answers="A", max_score=2)

    # correct answer
    answers = {"1": "A"}
    qscores, total = grade_submission(answers, [q])
    assert qscores["1"] == 2.0
    assert total == 2.0

    # incorrect answer
    answers = {"1": "B"}
    qscores, total = grade_submission(answers, [q])
    assert qscores["1"] == 0.0
    assert total == 0.0

    # missing answer
    answers = {}
    qscores, total = grade_submission(answers, [q])
    assert qscores["1"] == 0.0
    assert total == 0.0


def test_multi_choice_exact_match_and_order_irrelevant():
    q = DummyQuestion(id="abc", type="multi_choice", correct_answers=["A", "C"], max_score=3)

    # exact match same order
    answers = {"abc": ["A", "C"]}
    qscores, total = grade_submission(answers, [q])
    assert qscores["abc"] == 3.0
    assert total == 3.0

    # exact match different order
    answers = {"abc": ["C", "A"]}
    qscores, total = grade_submission(answers, [q])
    assert qscores["abc"] == 3.0
    assert total == 3.0

    # partial match -> zero
    answers = {"abc": ["A"]}
    qscores, total = grade_submission(answers, [q])
    assert qscores["abc"] == 0.0
    assert total == 0.0

    # answer not a list -> zero
    answers = {"abc": "A"}
    qscores, total = grade_submission(answers, [q])
    assert qscores["abc"] == 0.0
    assert total == 0.0


def test_text_question_is_none_and_not_counted():
    q1 = DummyQuestion(id=uuid.uuid4(), type="text", correct_answers=None, max_score=5)
    q2 = DummyQuestion(id=2, type="single_choice", correct_answers=1, max_score=2)

    # only q2 auto-graded
    answers = {str(q2.id): 1, str(q1.id): "Some text"}
    qscores, total = grade_submission(answers, [q1, q2])

    # text question should be None
    assert qscores[str(q1.id)] is None
    # single choice scored
    assert qscores[str(q2.id)] == 2.0
    assert total == 2.0

