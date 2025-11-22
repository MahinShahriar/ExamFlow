from fastapi.testclient import TestClient
from app.app import app
from openpyxl import Workbook
from io import BytesIO
import json

client = TestClient(app)

def test_upload_wrong_file_format():
    response = client.post(
        "/questions/import",
        files={"file": ("data.txt", b"hello", "text/plain")}
    )
    assert response.status_code == 400
    assert response.json()["detail"]

def test_missing_columns():
    wb = Workbook()
    ws = wb.active
    ws.append(["title"])  # Only 1 column

    file = BytesIO()
    wb.save(file)
    file.seek(0)

    response = client.post(
        "/questions/import",
        files={"file": ("questions.xlsx", file.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )

    assert response.status_code == 400

def test_valid_excel_upload():
    wb = Workbook()
    ws = wb.active

    # Full required columns
    ws.append([
        "title", "description", "complexity", "type",
        "options(json)", "correct_answers(json)", "max_score", "tags(csv)"
    ])

    ws.append([
        "What is 2+2?",
        "basic math",
        "easy",
        "single_choice",
        json.dumps(["1", "2", "4"]),
        json.dumps(["4"]),
        1,
        "math"
    ])

    file = BytesIO()
    wb.save(file)
    file.seek(0)

    response = client.post(
        "/questions/import",
        files={"file": ("ok.xlsx", file.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert response.status_code == 200