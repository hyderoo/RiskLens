import math
import pytest
from backend.app.risk import Bands, band_of, confusion, scenario, psi, DEFAULT_BANDS
from backend.app.filters import Filters
from backend.models.features import FEATURES, FORBIDDEN, NUMERIC, CATEGORICAL
from backend.pipeline.build_warehouse import labels_json_to_csv


def test_band_boundaries():
    b = Bands(*DEFAULT_BANDS)
    assert band_of(0.0, b) == "low" and band_of(b.medium - 1e-9, b) == "low"
    assert band_of(b.medium, b) == "medium" and band_of(b.high, b) == "high" and band_of(b.critical, b) == "critical"
    assert band_of(None, b) is None


def test_bands_validation():
    with pytest.raises(ValueError): Bands(0.5, 0.2, 0.9).validate()
    with pytest.raises(ValueError): Bands(0.1, 0.2, 1.5).validate()


def test_confusion_threshold_is_inclusive_and_counts():
    y = [1, 1, 0, 0, 0]; p = [0.9, 0.2, 0.2, 0.1, 0.9]
    m = confusion(y, p, 0.2, amount=[10, 20, 30, 40, 50])
    assert (m["tp"], m["fp"], m["fn"], m["tn"]) == (2, 2, 0, 1)
    assert m["precision"] == 0.5 and m["recall"] == 1.0 and math.isclose(m["f1"], 2 / 3)
    assert m["flagged_amount"] == 10 + 20 + 30 + 50 and m["fraud_amount_caught"] == 30


def test_confusion_empty_and_imbalanced():
    assert confusion([], [], 0.5)["precision"] == 0.0
    m = confusion([0] * 999 + [1], [0.0] * 1000, 0.5)
    assert m["accuracy"] == 0.999 and m["recall"] == 0.0  # accuracy looks great, recall is zero


def test_scenario_formulas():
    s = scenario(1000, 100000.0, 50, 5000.0, 200, review_rate=0.5, recovery_rate=0.4, minutes_per_review=12, analyst_hours_per_day=6)
    assert s["reviewed"] == 500 and s["reviewed_amount"] == 50000
    assert s["fraud_amount_in_reviewed"] == 2500 and s["hypothetical_recovered_amount"] == 1000
    assert math.isclose(s["review_hours"], 100.0) and math.isclose(s["share_of_all_fraud_reviewed"], 25 / 200)
    for bad in ({"review_rate": 1.5, "recovery_rate": 0.5}, {"review_rate": 0.5, "recovery_rate": -0.1}):
        with pytest.raises(ValueError): scenario(1, 1.0, 0, 0.0, 1, minutes_per_review=1, **bad)


def test_psi_identical_is_zero_and_shift_positive():
    assert psi([10, 20, 30], [10, 20, 30]) == pytest.approx(0, abs=1e-9)
    assert psi([10, 20, 30], [30, 20, 10]) > 0.25
    with pytest.raises(ValueError): psi([1], [1, 2])


def test_no_label_leakage_in_features():
    assert not (set(FEATURES) & FORBIDDEN)
    assert "is_fraud" not in FEATURES and set(NUMERIC).isdisjoint(CATEGORICAL)


def test_filters_build_parameterised_where():
    f = Filters(date_from="2018-01-01", amount_min=10, label="fraud", mcc="5311", score_min=0.02)
    w, p = f.where()
    assert "5311" not in w and "5311" in p          # values are bound parameters, never inlined
    assert "is_fraud = true" in w and len(p) == 4
    assert Filters().where() == ("", [])


def test_filters_reject_bad_input():
    with pytest.raises(Exception): Filters(mcc="5311; drop table txn")
    with pytest.raises(Exception): Filters(score_min=2)


def test_labels_json_stream_parser(tmp_path):
    src = tmp_path / "l.json"; dst = tmp_path / "l.csv"
    src.write_text('{"target": {"1": "No", "22": "Yes", "333": "No"}}')
    assert labels_json_to_csv(src, dst) == 3
    assert dst.read_text().splitlines() == ["id,label", "1,No", "22,Yes", "333,No"]


def test_labels_json_malformed_is_safe(tmp_path):
    src = tmp_path / "l.json"; dst = tmp_path / "l.csv"; src.write_text("not json at all")
    assert labels_json_to_csv(src, dst) == 0


def test_case_store_persistence_and_history(tmp_path, monkeypatch):
    from backend.app import cases
    monkeypatch.setattr(cases, "CASES_DB", tmp_path / "c.sqlite"); monkeypatch.setattr(cases, "WORK_DIR", tmp_path)
    c = cases.create(42, "high", "first look", 0.03)
    assert c["status"] == "open" and c["disposition"] == "none"
    c2 = cases.update(c["id"], status="closed", disposition="false_positive", notes="cleared")
    assert c2["status"] == "closed" and len(c2["history"]) == 4  # created + status + disposition + notes
    assert cases.listing("closed")[0]["txn_id"] == 42 and cases.update(999, status="open") is None
