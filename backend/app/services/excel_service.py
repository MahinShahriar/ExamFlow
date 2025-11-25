import pandas as pd
import json


def parse_excel(file):
    df = pd.read_excel(file)

    required_columns = [
        "title",
        "description",
        "complexity",
        "type",
        "options(json)",
        "correct_answers(json)",
        "max_score",
        "tags(csv)",
    ]
    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        # Raise KeyError so upstream router can return a HTTP 400 with a helpful message
        raise KeyError(missing[0])

    questions = []

    def get_json_value(value):
        return json.loads(value) if pd.notna(value) else []

    for _, row in df.iterrows():
        q = {
            "title": row["title"],
            "description": row.get("description", ""),
            "complexity": row.get("complexity"),
            "type": row.get("type"),
            "options": get_json_value(row["options(json)"]),
            "correct_answers": get_json_value(row.get("correct_answers(json)")),
            "max_score": row.get("max_score", 1),
            "tags": [tag.strip() for tag in row.get("tags(csv)").split(",")] if row.get("tags(csv)") else [],
        }

        questions.append(q)

    return questions