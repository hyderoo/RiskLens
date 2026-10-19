import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.pipeline.config import DB_PATH

client = TestClient(app, raise_server_exceptions=False)
needs_db = pytest.mark.skipif(not DB_PATH.exists(), reason="warehouse not built")


def test_validation_errors_are_422():
    assert client.get("/api/transactions?sort=drop_table").status_code == 422
    assert client.get("/api/transactions?page_size=100000").status_code == 422
    assert client.get("/api/overview?band_medium=0.5&band_high=0.2").status_code in (422, 503)
    assert client.get("/api/scenario?threshold=2").status_code == 422
    assert client.get("/api/analytics/fraud?dimension=bogus").status_code == 422
    assert client.post("/api/risk/score", json={"amount": "x"}).status_code == 422
    assert client.post("/api/cases", json={"txn_id": -1}).status_code == 422


@needs_db
def test_status_and_pagination():
    s = client.get("/api/status").json(); assert s["transactions"] > 13_000_000 and s["labeled"] < s["transactions"]
    r = client.get("/api/transactions?page_size=5&page=2&sort=amount&order=desc").json()
    assert len(r["rows"]) == 5 and r["page"] == 2
    amounts = [x["amount"] for x in r["rows"]]; assert amounts == sorted(amounts, reverse=True)
    assert "card_number" not in r["rows"][0] and "cvv" not in r["rows"][0]


@needs_db
def test_filters_apply_and_export_matches():
    r = client.get("/api/transactions?label=fraud&date_from=2019-01-01&amount_min=100&page_size=50").json()
    assert r["total"] > 0 and all(x["is_fraud"] is True and x["amount"] >= 100 and x["date"] >= "2019-01-01" for x in r["rows"])
    csv = client.get("/api/transactions/export?label=fraud&limit=10").text.splitlines()
    assert len(csv) == 11 and csv[0].startswith("id,date")


@needs_db
def test_threshold_endpoint_monotonic():
    lo = client.get("/api/model/threshold?threshold=0.001").json(); hi = client.get("/api/model/threshold?threshold=0.03").json()
    assert lo["recall"] >= hi["recall"] and lo["flagged"] >= hi["flagged"] and lo["tp"] + lo["fn"] == hi["tp"] + hi["fn"]


@needs_db
def test_unknown_transaction_404_and_no_stacktrace():
    r = client.get("/api/transactions/1"); assert r.status_code == 404 and "Traceback" not in r.text and "/home" not in r.text


@needs_db
def test_scenario_formulas_document_analyst_load():
    r = client.get("/api/scenario", params={"threshold": 0.03, "review_rate": 0.5})
    assert r.status_code == 200
    assert any(f.startswith("analysts_needed") for f in r.json()["formulas"])

def test_monitoring_rejects_reversed_psi_thresholds():
    assert client.get("/api/monitoring?psi_warn=0.5&psi_alert=0.1").status_code == 422


def test_reversed_ranges_and_out_of_bounds_are_422():
    for query in ("amount_min=100&amount_max=1", "date_from=2019-02-01&date_to=2019-01-01", "score_min=0.8&score_max=0.2", "amount_min=1000001"):
        r = client.get('/api/transactions?' + query)
        assert r.status_code == 422, (query, r.text)
