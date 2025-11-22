from typing import Dict, Any, Tuple, List


def grade_submission(answers: Dict[str, Any], questions: List[Any]) -> Tuple[Dict[str, float | None], float]:
    """
    Grade the given answers against the provided questions.
    - answers: mapping question_id (str or uuid) -> answer value
    - questions: list of ORM Question objects (must have id, type, correct_answers, max_score)

    Returns (question_scores: dict, total_score: float)
    For text/image questions, score will be None (to be graded later).
    """
    question_scores: Dict[str, float | None] = {}
    total = 0.0

    # Build a lookup by id (string) for convenience
    qmap = {str(q.id): q for q in questions}

    for qid_str, q in qmap.items():
        ans = answers.get(qid_str)
        if q.type in ("single_choice", "multi_choice"):
            # Normalize stored correct answers shape
            correct = q.correct_answers
            # single_choice: correct is a single value (string/int)
            # multi_choice: correct is a list
            score = 0.0
            try:
                if q.type == "single_choice":
                    if ans is not None and ans == correct:
                        score = float(q.max_score or 0)
                else:  # multi_choice
                    # Answer should be a list; treat as set equality (order doesn't matter)
                    if ans is not None and isinstance(ans, (list, tuple)) and isinstance(correct, (list, tuple)):
                        if set(ans) == set(correct):
                            score = float(q.max_score or 0)
            except Exception:
                score = 0.0
            question_scores[qid_str] = score
            total += score
        else:
            # text/image: leave for manual grading
            question_scores[qid_str] = None

    return question_scores, total

