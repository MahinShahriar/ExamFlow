import pandas as pd
import json

def parse_excel(file):
    df = pd.read_excel(file)

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
            "tags": [tag.strip() for tag in row.get("tags(csv)").split(",")] if row.get("tags(csv)") else []
        }

        questions.append(q)

    return questions