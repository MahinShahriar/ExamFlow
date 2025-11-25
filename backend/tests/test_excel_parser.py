from openpyxl import Workbook
from io import BytesIO
import json
import pytest

from ..app.services.excel_service import parse_excel


def bytesio_from_workbook(wb: Workbook) -> BytesIO:
    f = BytesIO()
    wb.save(f)
    f.seek(0)
    return f


def test_upload_wrong_file_format():
    # Non-Excel bytes should cause pandas.read_excel to raise an error
    bad_file = BytesIO(b"not-an-excel-file")
    with pytest.raises(Exception):
        parse_excel(bad_file)


def test_missing_columns():
    wb = Workbook()
    ws = wb.active
    # only title header, missing required columns like options(json)
    ws.append(["title"])  # Only 1 column
    f = bytesio_from_workbook(wb)

    with pytest.raises(KeyError):
        parse_excel(f)


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

    f = bytesio_from_workbook(wb)

    result = parse_excel(f)
    assert isinstance(result, list)
    assert len(result) == 1
    q = result[0]
    assert q["title"] == "What is 2+2?"
    assert q["options"] == ["1", "2", "4"]
    assert q["correct_answers"] == ["4"]
