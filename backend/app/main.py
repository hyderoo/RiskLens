"""RiskLens API. Historical-data analytics + model estimates. Not connected to any bank or live feed."""
from __future__ import annotations
import io, logging, os, threading
from functools import lru_cache
from typing import Literal, Optional
import numpy as np, pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from . import cases as case_store, db
from .filters import Filters, filters_dep
from .model_service import eval_preds, explain_frame, metrics, rule_indicators, score_frame
from .risk import Bands, band_case_sql, band_of, DEFAULT_BANDS, scenario as scenario_calc, _derive, psi as psi_fn
from ..models.features import FEATURES, DESCRIPTIONS

log = logging.getLogger("risklens")
app = FastAPI(title="RiskLens API", version="1.0.0", description="Fraud & transaction risk analytics on the Kaggle 'Financial Transactions' dataset (synthetic, historical).")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("RISKLENS_CORS", "http://localhost:3000,http://127.0.0.1:3000").split(","), allow_methods=["GET", "POST", "PATCH"], allow_headers=["*"])

DISCLAIMER = ("Historical analysis of a public synthetic dataset plus model-generated estimates. Not connected to any bank, "
              "no live transactions, and nothing here prevents real fraud.")


@app.exception_handler(FileNotFoundError)
async def _nf(_: Request, e: FileNotFoundError):
    return JSONResponse(status_code=503, content={"error": "warehouse_not_built", "detail": "Run the data pipeline first (see README)."})


@app.exception_handler(Exception)
async def _any(_: Request, e: Exception):
    log.exception("unhandled error")  # no transaction details are logged
    return JSONResponse(status_code=500, content={"error": "internal_error", "detail": "Unexpected server error."})


def thr_default() -> float:
    return metrics()["models"]["LightGBM"]["selected_threshold_validation"]


def bands_dep(band_medium: float = Query(DEFAULT_BANDS[0], ge=0, le=1), band_high: float = Query(DEFAULT_BANDS[1], ge=0, le=1),
              band_critical: float = Query(DEFAULT_BANDS[2], ge=0, le=1)) -> Bands:
    try: return Bands(band_medium, band_high, band_critical).validate()
    except ValueError as e: raise HTTPException(422, str(e))


def label_status(v) -> str:
    return "unlabeled" if v is None or v != v else ("confirmed_fraud_label" if bool(v) else "labeled_non_fraud")


# ----------------------------------------------------------------------------- status / schema
@app.get("/api/status")
def status():
    r = db.rows("""select count(*) n, min(date) first_ts, max(date) last_ts, sum((is_fraud is not null)::INT) labeled,
                   sum(coalesce(is_fraud,false)::INT) fraud, sum(amount) total_amount from txn""")[0]
    splits = db.rows("select split, count(*) n, sum(coalesce(is_fraud,false)::INT) fraud, min(date) first_ts, max(date) last_ts from txn group by 1 order by 2 desc")
    m = metrics()
    return dict(disclaimer=DISCLAIMER, dataset="Kaggle Financial Transactions (synthetic, 2010-2019)", transactions=int(r["n"]),
                first_timestamp=str(r["first_ts"]), latest_timestamp=str(r["last_ts"]), labeled=int(r["labeled"]), unlabeled=int(r["n"] - r["labeled"]),
                confirmed_fraud=int(r["fraud"]), total_amount=float(r["total_amount"]), splits=splits,
                model=dict(name="LightGBM + isotonic calibration", seed=m["config"]["seed"], best_iteration=m["config"]["lgb_best_iteration"],
                           default_threshold=thr_default(), train_end=m["config"]["train_end"], val_end=m["config"]["val_end"]))


@app.get("/api/schema")
def schema():
    cols = db.rows("describe select * from txn")
    return dict(columns=[dict(name=c["column_name"], type=c["column_type"], description=DESCRIPTIONS.get(c["column_name"], "")) for c in cols],
                dropped_fields=["card_number", "cvv", "address", "latitude", "longitude"],
                label_note="is_fraud comes from train_fraud_labels.json and covers only a subset of transactions; NULL = unlabeled (not non-fraud).")


# ----------------------------------------------------------------------------- overview
@app.get("/api/overview")
def overview(f: Filters = Depends(filters_dep), threshold: float = Query(None, ge=0, le=1), bands: Bands = Depends(bands_dep)):
    thr = thr_default() if threshold is None else threshold
    w, p = f.where()
    k = db.rows(f"""select count(*) n, sum(amount) amt, sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud,
        sum(case when is_fraud then amount else 0 end) fraud_amt, sum((risk_score >= {thr!r})::INT) flagged,
        sum(case when risk_score >= {thr!r} then amount else 0 end) flagged_amt,
        sum(((risk_score >= {thr!r}) and is_fraud)::INT) flagged_fraud_labeled,
        sum(((risk_score >= {thr!r}) and is_fraud is not null)::INT) flagged_labeled,
        max(date) last_ts from txn{w}""", p)[0]
    n = int(k["n"] or 0); lab = int(k["labeled"] or 0); fr = int(k["fraud"] or 0)
    trend = db.rows(f"""select strftime(date_trunc('month', date), '%Y-%m') as ym, count(*) n, sum(amount) amount,
        sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud, sum(case when is_fraud then amount else 0 end) fraud_amount
        from txn{w} group by 1 order by 1""", p)
    dist = db.rows(f"select {band_case_sql(bands)} band, count(*) n, sum(amount) amount, sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud from txn{w} group by 1", p)
    by_chip = db.rows(f"select use_chip as grp, count(*) n, sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud from txn{w} group by 1 order by 2 desc", p)
    top_mcc = db.rows(f"""select t.mcc as grp, any_value(m.description) as mcc_desc, count(*) n, sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud
        from txn t left join mcc m on m.code = t.mcc{w} group by 1 order by fraud desc limit 8""", p)
    top_cases = db.rows(f"""select id, date, amount, merchant_city, mcc, use_chip, risk_score, is_fraud, split from txn{w}
        {'and' if w else 'where'} split in ('validation','test') order by risk_score desc limit 10""", p)
    for r in top_cases: r["band"] = band_of(r["risk_score"], bands); r["label_status"] = label_status(r["is_fraud"])
    ev = metrics()["models"]["LightGBM"]
    return dict(disclaimer=DISCLAIMER, filters=f.model_dump(mode="json"), threshold=thr,
                kpis=dict(transactions=n, total_amount=float(k["amt"] or 0), labeled=lab, unlabeled=n - lab, confirmed_fraud=fr,
                          fraud_rate_labeled=(fr / lab) if lab else None, confirmed_fraud_amount=float(k["fraud_amt"] or 0),
                          avg_fraud_amount=float(k["fraud_amt"] or 0) / fr if fr else None,
                          model_flagged=int(k["flagged"] or 0), model_flagged_amount=float(k["flagged_amt"] or 0),
                          flagged_labeled=int(k["flagged_labeled"] or 0), flagged_fraud_labeled=int(k["flagged_fraud_labeled"] or 0),
                          latest_timestamp=str(k["last_ts"])),
                model_eval_test=dict(scope="held-out test period (2018-07 to 2019-10), threshold chosen on validation",
                                     precision=ev["test"]["at_threshold"]["precision"], recall=ev["test"]["at_threshold"]["recall"],
                                     threshold=ev["selected_threshold_validation"], pr_auc=ev["test"]["pr_auc"]),
                trend=trend, risk_distribution=dist, by_channel=by_chip, top_mcc=top_mcc, top_cases=top_cases,
                definitions=dict(confirmed_fraud="Transaction with label Yes in train_fraud_labels.json.",
                                 model_flagged="Transaction whose calibrated model score is >= the threshold. A flag is not confirmed fraud.",
                                 fraud_rate_labeled="Confirmed fraud / labeled transactions (unlabeled transactions excluded).",
                                 caveat="Scores on rows before 2017-01 are in-sample (model was trained on them)."))


# ----------------------------------------------------------------------------- transactions
SORTS = {"date": "date", "amount": "amount", "risk_score": "risk_score", "id": "id"}
COLS = "id, date, client_id, card_id, amount, use_chip, merchant_id, merchant_city, merchant_state, mcc, errors, is_fraud, risk_score, split"


@app.get("/api/transactions")
def transactions(f: Filters = Depends(filters_dep), page: int = Query(1, ge=1, le=100000), page_size: int = Query(25, ge=1, le=200),
                 sort: Literal["date", "amount", "risk_score", "id"] = "date", order: Literal["asc", "desc"] = "desc", bands: Bands = Depends(bands_dep)):
    w, p = f.where()
    total = int(db.scalar(f"select count(*) from txn{w}", p) or 0)
    data = db.rows(f"select {COLS} from txn{w} order by {SORTS[sort]} {order}, id limit ? offset ?", p + [page_size, (page - 1) * page_size])
    cmap = {c["txn_id"]: c for c in case_store.listing(limit=1000)} if data else {}
    for r in data:
        r["band"] = band_of(r["risk_score"], bands); r["label_status"] = label_status(r["is_fraud"])
        r["case_status"] = cmap.get(r["id"], {}).get("status", "none")
    return dict(total=total, page=page, page_size=page_size, pages=max(1, -(-total // page_size)), rows=data)


@app.get("/api/transactions/export")
def export(f: Filters = Depends(filters_dep), limit: int = Query(50000, ge=1, le=100000),
           sort: Literal["date", "amount", "risk_score", "id"] = "date", order: Literal["asc", "desc"] = "desc"):
    w, p = f.where()
    df = db.query(f"select {COLS} from txn{w} order by {SORTS[sort]} {order}, id limit ?", p + [limit])
    buf = io.StringIO(); df.to_csv(buf, index=False)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=risklens_transactions.csv"})


@app.get("/api/transactions/{txn_id}")
def transaction_detail(txn_id: int, bands: Bands = Depends(bands_dep)):
    r = db.rows("select t.*, m.description mcc_description from txn t left join mcc m on m.code = t.mcc where t.id = ?", [txn_id])
    if not r: raise HTTPException(404, "Transaction not found")
    r = r[0]; df = pd.DataFrame([r])
    expl = explain_frame(df)[0]
    prior = db.rows("select id, date, amount, merchant_city, mcc, use_chip, risk_score, is_fraud from txn where client_id = ? and date <= ? and id <> ? order by date desc, id desc limit 5",
                    [r["client_id"], r["date"], txn_id])
    detail = {k: r[k] for k in ("id", "date", "client_id", "card_id", "amount", "use_chip", "merchant_id", "merchant_city", "merchant_state", "zip", "mcc",
                                "mcc_description", "errors", "split", "risk_score")}
    detail.update(label_status=label_status(r["is_fraud"]), is_fraud=r["is_fraud"], band=band_of(r["risk_score"], bands),
                  score_scope="in-sample (training period)" if r["split"] == "train" else "out-of-sample" if r["split"] in ("validation", "test") else "unlabeled row, model-scored")
    feats = {k: r[k] for k in FEATURES}
    return dict(transaction=detail, features=feats, explanation=expl, indicators=rule_indicators(r), recent_client_activity=prior,
                cases=[c for c in case_store.listing(limit=1000) if c["txn_id"] == txn_id],
                explanation_note="Contributions are TreeSHAP values in log-odds relative to the model baseline. They describe the model, not causes of fraud.")


# ----------------------------------------------------------------------------- fraud analytics
DIMS = {
    "use_chip": "use_chip", "mcc": "mcc", "merchant_state": "coalesce(merchant_state,'ONLINE/none')", "hour": "hour", "dow": "dow",
    "card_brand": "card_brand", "card_type": "card_type", "year": "year(date)", "error": "case when errors is null then 'no error' else errors end",
    "client_id": "client_id", "merchant_id": "merchant_id",
    "amount_band": "case when amount < 0 then '1: refund (<0)' when amount < 10 then '2: 0-10' when amount < 25 then '3: 10-25' when amount < 50 then '4: 25-50' "
                   "when amount < 100 then '5: 50-100' when amount < 250 then '6: 100-250' when amount < 500 then '7: 250-500' when amount < 1000 then '8: 500-1000' else '9: 1000+' end",
    "client_velocity_1h": "case when client_txn_1h = 0 then '0' when client_txn_1h = 1 then '1' when client_txn_1h = 2 then '2' when client_txn_1h < 5 then '3-4' else '5+' end",
    "amount_vs_history": "case when amount_z_client is null then 'insufficient history' when amount_z_client < -2 then 'z < -2' when amount_z_client < 2 then '-2 <= z < 2' when amount_z_client < 4 then '2 <= z < 4' else 'z >= 4' end",
}
ORDERED_DIMS = ("hour", "dow", "year", "amount_band", "client_velocity_1h", "amount_vs_history")


@app.get("/api/analytics/fraud")
def fraud_analytics(f: Filters = Depends(filters_dep), dimension: Literal[tuple(DIMS)] = "use_chip", limit: int = Query(25, ge=1, le=100),
                    min_labeled: int = Query(200, ge=1)):
    w, p = f.where(); expr = DIMS[dimension]
    tot = db.rows(f"select sum(coalesce(is_fraud,false)::INT) fraud, sum((is_fraud is not null)::INT) labeled from txn{w}", p)[0]
    tf, tl = float(tot["fraud"] or 0), float(tot["labeled"] or 0)
    join = "left join mcc m on m.code = t.mcc" if dimension == "mcc" else ""
    lab = "any_value(m.description)" if dimension == "mcc" else "NULL"
    rowsq = db.rows(f"""select cast({expr} as varchar) as grp, {lab} as mcc_desc, count(*) n, sum((is_fraud is not null)::INT) labeled,
        sum(coalesce(is_fraud,false)::INT) fraud, sum(case when is_fraud then amount else 0 end) fraud_amount, sum(amount) amount
        from txn t {join}{w} group by 1 order by fraud desc, n desc limit ?""", p + [limit * 4 if dimension in ORDERED_DIMS else limit])
    for r in rowsq:
        r["fraud_rate"] = (r["fraud"] / r["labeled"]) if r["labeled"] else None
        r["share_of_fraud"] = (r["fraud"] / tf) if tf else None
        r["low_sample"] = r["labeled"] < min_labeled
    if dimension in ORDERED_DIMS:
        rowsq.sort(key=lambda r: int(r["grp"]) if str(r["grp"]).isdigit() else r["grp"])
    return dict(dimension=dimension, base_rate=(tf / tl) if tl else None, labeled=int(tl), fraud=int(tf), rows=rowsq,
                note="Rates use labeled transactions only. 'low_sample' rows have too few labeled transactions for a stable rate. Association is not causation.")


@app.get("/api/analytics/summary")
def analytics_summary(f: Filters = Depends(filters_dep)):
    w, p = f.where(); a = ' and' if w else ' where'
    amt = db.rows(f"""select is_fraud, count(*) n, avg(amount) mean, median(amount) median, quantile_cont(amount, 0.95) p95, quantile_cont(amount, 0.99) p99, max(amount) max
                      from txn{w}{a} is_fraud is not null group by 1""", p)
    hv = db.rows(f"""select count(*) n, sum(coalesce(is_fraud,false)::INT) fraud, sum((is_fraud is not null)::INT) labeled, sum(case when is_fraud then amount else 0 end) fraud_amt
                     from txn{w}{a} amount >= 1000""", p)[0]
    out = db.rows(f"""select count(*) n, sum(coalesce(is_fraud,false)::INT) fraud, sum((is_fraud is not null)::INT) labeled from txn{w}{a} abs(amount_z_client) >= 4""", p)[0]
    conc = db.rows(f"""with c as (select client_id, sum(is_fraud::INT) f from txn{w}{a} is_fraud is not null group by 1),
        r as (select f, row_number() over (order by f desc) rn, count(*) over () cnt, sum(f) over () tot from c)
        select max(cnt) clients, max(tot) fraud, sum(case when rn <= cnt*0.01 then f else 0 end) top1, sum(case when rn <= cnt*0.10 then f else 0 end) top10,
        sum((f>0)::INT) clients_with_fraud from r""", p)[0]
    return dict(amount_by_label=[dict(label="fraud" if r["is_fraud"] else "non-fraud", **{k: float(v) for k, v in r.items() if k != "is_fraud"}) for r in amt],
                high_value=dict(threshold=1000, **{k: float(v or 0) for k, v in hv.items()}),
                outliers=dict(rule="|amount z-score vs client's earlier history| >= 4", **{k: float(v or 0) for k, v in out.items()}),
                concentration=dict(clients=int(conc["clients"] or 0), clients_with_fraud=int(conc["clients_with_fraud"] or 0), fraud=int(conc["fraud"] or 0),
                                   share_in_top_1pct_clients=(conc["top1"] / conc["fraud"]) if conc["fraud"] else None,
                                   share_in_top_10pct_clients=(conc["top10"] / conc["fraud"]) if conc["fraud"] else None))


@app.get("/api/analytics/amount-histogram")
def amount_hist(f: Filters = Depends(filters_dep)):
    w, p = f.where()
    r = db.rows(f"""select cast(floor(least(greatest(amount, -50), 500) / 10) * 10 as int) bucket, count(*) n, sum(coalesce(is_fraud,false)::INT) fraud, sum((is_fraud is not null)::INT) labeled
                    from txn{w} group by 1 order by 1""", p)
    return dict(bucket_width=10, note="Amounts clipped to [-50, 500] for display; bucket label = lower edge.", rows=r)


# ----------------------------------------------------------------------------- risk scoring
@app.get("/api/risk/config")
def risk_config():
    return dict(default_bands=dict(medium=DEFAULT_BANDS[0], high=DEFAULT_BANDS[1], critical=DEFAULT_BANDS[2]), default_threshold=thr_default(),
                note="Bands apply to the calibrated probability. Defaults are initial, adjustable choices for this dataset, not industry standards.")


@app.get("/api/risk/distribution")
def risk_distribution(f: Filters = Depends(filters_dep), bands: Bands = Depends(bands_dep)):
    w, p = f.where()
    r = db.rows(f"""select {band_case_sql(bands)} band, count(*) n, sum(amount) amount, sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud,
                    sum(case when is_fraud then amount else 0 end) fraud_amount from txn{w} group by 1""", p)
    order = {b: i for i, b in enumerate(("low", "medium", "high", "critical"))}
    for x in r: x["fraud_rate_labeled"] = x["fraud"] / x["labeled"] if x["labeled"] else None
    r.sort(key=lambda x: order[x["band"]])
    return dict(bands=bands.__dict__, rows=r)


class TxnInput(BaseModel):
    amount: float = Field(..., ge=-100000, le=100000)
    use_chip: Literal["Swipe Transaction", "Chip Transaction", "Online Transaction"] = "Swipe Transaction"
    mcc: str = Field("5411", pattern=r"^\d{3,5}$")
    merchant_state: Optional[str] = Field(None, max_length=4)
    hour: int = Field(12, ge=0, le=23)
    dow: int = Field(2, ge=0, le=6)
    client_txn_1h: Optional[int] = Field(None, ge=0, le=500)
    client_txn_24h: Optional[int] = Field(None, ge=0, le=2000)
    new_merchant_for_client: Optional[int] = Field(None, ge=0, le=1)
    amount_z_client: Optional[float] = Field(None, ge=-1000, le=1000)
    err_bad_cvv: int = Field(0, ge=0, le=1)
    err_bad_card: int = Field(0, ge=0, le=1)
    err_bad_exp: int = Field(0, ge=0, le=1)
    credit_score: Optional[int] = Field(None, ge=300, le=900)


@app.post("/api/risk/score")
def risk_score(t: TxnInput, bands: Bands = Depends(bands_dep)):
    row = {k: np.nan for k in FEATURES}
    row.update({k: v for k, v in t.model_dump().items() if v is not None})
    row.update(is_online=int(t.use_chip == "Online Transaction"), is_night=int(t.hour < 6), is_refund=int(t.amount < 0))
    for k in ("card_brand", "card_type"): row[k] = None
    df = pd.DataFrame([row]); p = float(score_frame(df)[0])
    ex = explain_frame(df)[0]
    return dict(score=p, band=band_of(p, bands), above_default_threshold=p >= thr_default(), explanation=ex,
                note="Hypothetical what-if scoring. Features not supplied (client history, card/client attributes) are treated as missing, so this is less informative than scoring a real dataset row.")


# ----------------------------------------------------------------------------- model lab
@app.get("/api/model")
def model_info():
    m = metrics()
    return dict(disclaimer=DISCLAIMER, config={k: v for k, v in m["config"].items() if k != "features"}, features=[dict(name=f, description=DESCRIPTIONS.get(f, "")) for f in FEATURES],
                models={k: {kk: vv for kk, vv in v.items() if kk != "threshold_table"} for k, v in m["models"].items()},
                base_rate_test=m["base_rate_test"], calibration=m["raw_vs_calibrated"], performance_over_time=m["performance_over_time"],
                accuracy_note="With a 0.18% base rate, a model that flags nothing is 99.82% 'accurate' yet catches no fraud. Use precision, recall and PR-AUC.",
                protocol="Temporal split, preprocessing fit on training rows only, negatives down-sampled (not oversampled) with weights, threshold picked on validation, test scored once.")


@app.get("/api/model/threshold")
def model_threshold(threshold: float = Query(..., ge=0, le=1), model: Literal["lightgbm", "logistic"] = "lightgbm"):
    d = eval_preds(); p = d["p"].values if model == "lightgbm" else d["p_lr"].values
    y = d["y"].values.astype(bool); a = d["amount"].values; f = p >= threshold
    tp = int((f & y).sum()); fp = int((f & ~y).sum()); fn = int((~f & y).sum()); tn = int((~f & ~y).sum())
    out = _derive(tp, fp, fn, tn, float(a[f].sum()), float(a[f & y].sum()))
    out.update(threshold=threshold, model=model, scope="held-out test period (2018-07 to 2019-10)", fraud_amount_total=float(a[y].sum()),
               review_workload_per_1000_txns=1000 * out["flagged_rate"])
    return out


@app.get("/api/model/importance")
def importance():
    m = metrics(); return dict(rows=m["global_importance"], note=m["importance_note"] + " Importance does not imply causation.")


# ----------------------------------------------------------------------------- scenario
@app.get("/api/scenario")
def scenario(threshold: float = Query(..., ge=0, le=1), review_rate: float = Query(1.0, ge=0, le=1), recovery_rate: float = Query(0.5, ge=0, le=1),
             minutes_per_review: float = Query(10, ge=0, le=600), analyst_hours_per_day: float = Query(6, gt=0, le=24)):
    d = eval_preds(); y = d["y"].values.astype(bool); a = d["amount"].values; f = d["p"].values >= threshold
    days = max(1, int(db.scalar("select date_diff('day', min(date), max(date)) + 1 from txn where split = 'test'")))
    s = scenario_calc(int(f.sum()), float(a[f].sum()), int((f & y).sum()), float(a[f & y].sum()), int(y.sum()), review_rate, recovery_rate,
                      minutes_per_review, analyst_hours_per_day, days)
    s.update(flagged=int(f.sum()), flagged_amount=float(a[f].sum()), fraud_in_flagged=int((f & y).sum()), fraud_amount_in_flagged=float(a[f & y].sum()),
             total_fraud=int(y.sum()), total_fraud_amount=float(a[y].sum()), test_period_days=days,
             review_hours_per_day=s["review_hours"] / days, analysts_needed=s["review_hours"] / days / analyst_hours_per_day)
    s["assumptions"] = dict(review_rate="Share of flagged transactions a human reviews (pro-rata; higher-score-first ordering would capture more fraud).",
                            recovery_rate="ASSUMPTION: share of fraud value in reviewed items that could be recovered or avoided. Not observed in the data.",
                            minutes_per_review="ASSUMPTION: average analyst minutes per reviewed transaction.")
    s["formulas"] = ["reviewed = flagged x review_rate", "fraud_amount_in_reviewed = fraud_amount_in_flagged x review_rate",
                     "hypothetical_recovered = fraud_amount_in_reviewed x recovery_rate", "review_hours = reviewed x minutes_per_review / 60", "analysts_needed = review_hours / test_period_days (calendar days) / analyst_hours_per_day"]
    s["label"] = "SIMULATED SCENARIO on the held-out test period. Not actual savings or prevented loss."
    s["data_needed_for_expected_loss"] = "Chargeback/recovery outcomes, review cost per case, customer-friction cost, and fraud still undetected after review."
    return s


# ----------------------------------------------------------------------------- monitoring
@lru_cache(1)
def _quality():
    n = int(db.scalar("select count(*) from txn"))
    miss = {c: int(db.scalar(f"select count(*) from txn where {c} is null")) for c in ("merchant_state", "zip", "errors", "is_fraud", "amount_z_client", "secs_since_prev_client")}
    q = db.rows("""select sum((amount < 0)::INT) negative, sum((amount = 0)::INT) zero, sum((amount > 5000)::INT) over_5000, count(distinct id) distinct_ids,
                   sum((date > timestamp '2019-12-31')::INT) future_ts from txn""")[0]
    by_month = db.rows("select strftime(date_trunc('month', date), '%Y-%m') as ym, count(*) n, sum((is_fraud is not null)::INT) labeled, sum(coalesce(is_fraud,false)::INT) fraud from txn group by 1 order by 1")
    return dict(rows=n, missing={k: dict(count=v, rate=v / n) for k, v in miss.items()},
                invalid=dict(negative_amounts=int(q["negative"]), zero_amounts=int(q["zero"]), amounts_over_5000=int(q["over_5000"]), future_timestamps=int(q["future_ts"])),
                duplicates=dict(duplicate_ids=n - int(q["distinct_ids"])), by_month=by_month,
                notes=["merchant_state / zip are missing exactly for ONLINE merchants (structural, not an error).",
                       "errors is populated only when a transaction error occurred.",
                       "is_fraud missing = no label supplied (about one third of rows); excluded from all fraud rates and model metrics.",
                       "Negative amounts are refunds/reversals and are kept."])


@lru_cache(1)
def _drift():
    out = []
    for feat in ("amount", "amount_z_client", "client_txn_24h", "secs_since_prev_card", "risk_score"):
        base = db.query(f"select {feat} v from txn where split='train' and {feat} is not null using sample 300000").v.values.astype(float)
        edges = np.unique(np.quantile(base, np.linspace(0, 1, 11)[1:-1]))
        exp = np.bincount(np.searchsorted(edges, base, side="right"), minlength=len(edges) + 1)
        for sp in ("validation", "test"):
            cur = db.query(f"select {feat} v from txn where split='{sp}' and {feat} is not null using sample 300000").v.values.astype(float)
            act = np.bincount(np.searchsorted(edges, cur, side="right"), minlength=len(edges) + 1)
            out.append(dict(feature=feat, compared=f"{sp} vs train", psi=psi_fn(exp.tolist(), act.tolist())))
    return out


@app.get("/api/monitoring")
def monitoring(psi_warn: float = Query(0.10, ge=0, le=5), psi_alert: float = Query(0.25, ge=0, le=5), min_recall: float = Query(0.10, ge=0, le=1),
               max_missing_rate: float = Query(0.5, ge=0, le=1)):
    qual = _quality(); drift = _drift(); perf = metrics()["performance_over_time"]; alerts = []
    for d in drift:
        if d["psi"] >= psi_alert: alerts.append(dict(kind="input_drift", severity="high", subject=d["feature"], detail=f"PSI {d['psi']:.3f} ({d['compared']}) >= {psi_alert}"))
        elif d["psi"] >= psi_warn: alerts.append(dict(kind="input_drift", severity="medium", subject=d["feature"], detail=f"PSI {d['psi']:.3f} ({d['compared']}) >= {psi_warn}"))
    for q in perf:
        if q["recall"] < min_recall: alerts.append(dict(kind="model_performance", severity="medium", subject=q["quarter"], detail=f"Recall {q['recall']:.1%} < {min_recall:.0%} ({q['fraud']} labeled frauds)"))
    for k, v in qual["missing"].items():
        if v["rate"] > max_missing_rate and k != "is_fraud": alerts.append(dict(kind="data_quality", severity="low", subject=k, detail=f"{v['rate']:.1%} missing > {max_missing_rate:.0%}"))
    return dict(disclaimer="Computed on the historical dataset. This is not a live feed; alerts are a retrospective log.", quality=qual, drift=drift,
                performance_over_time=perf, alerts=alerts, config=dict(psi_warn=psi_warn, psi_alert=psi_alert, min_recall=min_recall, max_missing_rate=max_missing_rate),
                notes=["Input drift (PSI) compares feature distributions only; it does not prove the model got worse.",
                       "Model performance is measured only where labels exist (labeled rows, quarters with >=5 frauds)."])


# ----------------------------------------------------------------------------- cases
class CaseCreate(BaseModel):
    txn_id: int = Field(..., ge=0)
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    notes: str = Field("", max_length=4000)


class CasePatch(BaseModel):
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    status: Optional[Literal["open", "in_review", "escalated", "closed"]] = None
    disposition: Optional[Literal["none", "confirmed_fraud", "false_positive", "inconclusive"]] = None
    notes: Optional[str] = Field(None, max_length=4000)


@app.post("/api/cases", status_code=201)
def create_case(c: CaseCreate):
    r = db.rows("select risk_score from txn where id = ?", [c.txn_id])
    if not r: raise HTTPException(404, "Transaction not found")
    return case_store.create(c.txn_id, c.severity, c.notes, r[0]["risk_score"])


@app.get("/api/cases")
def list_cases(status: Optional[Literal["open", "in_review", "escalated", "closed"]] = None):
    return dict(rows=case_store.listing(status), persistence="Local SQLite file (single-user, local development). Not a multi-user production case system.")


@app.get("/api/cases/{case_id}")
def get_case(case_id: int):
    c = case_store.get(case_id)
    if not c: raise HTTPException(404, "Case not found")
    return c


@app.patch("/api/cases/{case_id}")
def patch_case(case_id: int, body: CasePatch):
    c = case_store.update(case_id, **body.model_dump(exclude_none=True))
    if not c: raise HTTPException(404, "Case not found")
    return c


# ----------------------------------------------------------------------------- recommendations & report
def recommendations() -> list[dict]:
    m = metrics(); g = m["models"]["LightGBM"]; t = g["test"]["at_threshold"]; rec = []
    if t["recall"] < 0.5:
        rec.append(dict(title="Recall is low at the validation-chosen threshold", metric=f"recall {t['recall']:.1%}, {t['fn']:,} frauds missed of {t['tp']+t['fn']:,} in test",
                        action="Evaluate a lower threshold using the Model Lab slider; review the added workload before adopting it.", evidence="model test metrics"))
    if t["precision"] < 0.2:
        rec.append(dict(title="Most flags are false positives", metric=f"precision {t['precision']:.1%}; {t['fp']:,} false positives for {t['tp']:,} true positives",
                        action="Quantify review burden per threshold (Scenario page) and test additional validated features before relying on this model for decisions.", evidence="model test metrics"))
    ch = db.rows("select use_chip as grp, count(*) labeled, avg(is_fraud::INT) rate from txn where is_fraud is not null group by 1 order by rate desc")
    base = db.scalar("select avg(is_fraud::INT) from txn where is_fraud is not null")
    if ch and ch[0]["rate"] > 3 * base:
        rec.append(dict(title=f"Fraud concentrates in {ch[0]['grp']}", metric=f"{ch[0]['rate']:.2%} vs {base:.2%} overall ({int(ch[0]['labeled']):,} labeled)",
                        action="Investigate whether extra authentication on this channel is operationally justified; the association is not proof of cause.", evidence="labeled historical data"))
    mc = db.rows("select mcc as grp, count(*) labeled, sum(is_fraud::INT) f, avg(is_fraud::INT) rate from txn where is_fraud is not null group by 1 having count(*) >= 2000 order by rate desc limit 1")
    if mc and mc[0]["rate"] > 5 * base:
        rec.append(dict(title=f"Merchant category {mc[0]['grp']} has an outsized fraud rate", metric=f"{mc[0]['rate']:.2%} on {int(mc[0]['labeled']):,} labeled txns ({int(mc[0]['f']):,} frauds)",
                        action="Review merchant-category-specific rules and sample cases; check whether a few merchants drive the rate.", evidence="labeled historical data"))
    unl = _quality()["missing"]["is_fraud"]["rate"]
    if unl > 0.1:
        rec.append(dict(title="A third of transactions have no fraud label", metric=f"{unl:.1%} unlabeled",
                        action="Obtain labels (or confirm they are all non-fraud) before treating the labeled subset as representative.", evidence="data quality"))
    pot = m["performance_over_time"]
    if pot:
        lo, hi = min(x["pr_auc"] for x in pot), max(x["pr_auc"] for x in pot)
        if hi > 3 * lo:
            rec.append(dict(title="Model performance is unstable across quarters", metric=f"quarterly PR-AUC from {lo:.3f} to {hi:.3f}",
                            action="Monitor performance by period and retrain on recent data before relying on any single estimate.", evidence="performance over time"))
    return rec


@app.get("/api/recommendations")
def recs():
    return dict(rows=recommendations(), note="Generated from the computed metrics shown on each item; none are proven causal.")


@app.get("/api/report")
def report():
    st = status(); m = metrics(); g = m["models"]["LightGBM"]
    fr = db.rows("select count(*) labeled, sum(is_fraud::INT) fraud, sum(case when is_fraud then amount else 0 end) fraud_amt from txn where is_fraud is not null")[0]
    top_mcc = db.rows("select t.mcc as grp, any_value(m.description) as mcc_desc, sum(is_fraud::INT) fraud from txn t left join mcc m on m.code = t.mcc where is_fraud is not null group by 1 order by fraud desc limit 5")
    return dict(title="RiskLens executive risk report", disclaimer=DISCLAIMER,
                period=dict(data_from=st["first_timestamp"], data_to=st["latest_timestamp"], test_period="2018-07-01 to 2019-10-31"),
                coverage=dict(transactions=st["transactions"], labeled=st["labeled"], unlabeled=st["unlabeled"], quality=_quality()["notes"]),
                findings=dict(confirmed_fraud=int(fr["fraud"]), labeled=int(fr["labeled"]), fraud_rate=float(fr["fraud"] / fr["labeled"]), confirmed_fraud_amount=float(fr["fraud_amt"]), top_mcc=top_mcc),
                model=dict(name="LightGBM (calibrated)", evaluation_scope="held-out test 2018-07 to 2019-10", pr_auc=g["test"]["pr_auc"], roc_auc=g["test"]["roc_auc"],
                           at_threshold=g["test"]["at_threshold"], baseline_pr_auc=m["models"]["Logistic Regression (baseline)"]["test"]["pr_auc"]),
                exposure=dict(test_flagged_amount=g["test"]["at_threshold"]["flagged_amount"], test_fraud_amount_caught=g["test"]["at_threshold"]["fraud_amount_caught"],
                              note="Flagged value is exposure under review, not loss. Caught amount is on labeled historical frauds, not realised savings."),
                recommendations=recommendations(),
                limitations=["Public synthetic dataset; results do not transfer to any real institution.", "Only ~67% of transactions carry a label.",
                             "Fraud counts vary sharply by year, suggesting generator artifacts; temporal stability is limited.",
                             "Model recall is modest at the chosen threshold; it is a triage aid for analysts, not an autonomous decision-maker."])


@app.on_event("startup")
def _warm():
    def go():
        try: _quality(); _drift()
        except Exception: log.warning("warm-up skipped")
    threading.Thread(target=go, daemon=True).start()
