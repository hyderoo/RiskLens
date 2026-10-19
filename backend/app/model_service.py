"""Model loading, single-transaction scoring and explanations (LightGBM TreeSHAP via pred_contrib)."""
from __future__ import annotations
import json
from functools import lru_cache
import joblib, lightgbm as lgb, numpy as np, pandas as pd
from ..models.features import FEATURES, NUMERIC, DESCRIPTIONS
from ..models.train import prep
from ..pipeline.config import WORK_DIR, ARTIFACT_DIR


@lru_cache(1)
def bundle():
    return joblib.load(WORK_DIR / "model_bundle.joblib")


@lru_cache(1)
def booster():
    return lgb.Booster(model_file=str(WORK_DIR / "lgbm_model.txt"))


@lru_cache(1)
def metrics() -> dict:
    return json.loads((ARTIFACT_DIR / "metrics.json").read_text())


@lru_cache(1)
def eval_preds() -> pd.DataFrame:
    """Held-out TEST-period predictions (never used for training or selection)."""
    return pd.read_parquet(WORK_DIR / "test_preds.parquet")


def score_frame(df: pd.DataFrame) -> np.ndarray:
    b = bundle(); raw = booster().predict(prep(df, b["levels"]))
    return b["iso"].predict(raw)


def explain_frame(df: pd.DataFrame, top: int = 8) -> list[dict]:
    b = bundle(); X = prep(df, b["levels"])
    contrib = booster().predict(X, pred_contrib=True)
    out = []
    for i in range(len(df)):
        base = float(contrib[i, -1]); c = contrib[i, :-1]
        order = np.argsort(-np.abs(c))[:top]
        feats = []
        for j in order:
            f = FEATURES[j]; v = df.iloc[i][f]
            feats.append(dict(feature=f, description=DESCRIPTIONS.get(f, ""), value=None if pd.isna(v) else (float(v) if f in NUMERIC else str(v)),
                              contribution=float(c[j]), direction="increases risk" if c[j] > 0 else "decreases risk"))
        out.append(dict(baseline_log_odds=base, total_log_odds=float(c.sum() + base), top_features=feats))
    return out


def rule_indicators(r: dict) -> list[str]:
    """Plain-language indicators from observed values (independent of the model; for analysts)."""
    ind = []
    if r.get("is_online"): ind.append("Online transaction (higher historical fraud rate than in-person).")
    if r.get("err_bad_cvv"): ind.append("Bad CVV error on this transaction.")
    if r.get("err_bad_card"): ind.append("Bad card number error on this transaction.")
    if r.get("err_bad_exp"): ind.append("Bad expiration error on this transaction.")
    if r.get("new_merchant_for_client"): ind.append("First time this client used this merchant.")
    z = r.get("amount_z_client")
    if z is not None and z == z and abs(z) >= 3: ind.append(f"Amount is {z:.1f} standard deviations from the client's earlier average.")
    if (r.get("client_txn_1h") or 0) >= 3: ind.append(f"{int(r['client_txn_1h'])} other transactions by this client in the previous hour.")
    if r.get("is_night"): ind.append("Transaction between 00:00 and 05:59.")
    if (r.get("client_prior_txn") or 0) < 5: ind.append("Limited client history (fewer than 5 earlier transactions): behavioural features are unreliable.")
    return ind
