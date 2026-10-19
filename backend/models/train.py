"""Train and evaluate fraud models on a temporal split. Reproducible (fixed seed).

Protocol
  * train      : labeled rows with date <  TRAIN_END (all fraud + NEG_SAMPLE_RATE of non-fraud, weighted back up)
  * validation : TRAIN_END <= date < VAL_END   (early stopping, calibration, threshold selection)
  * test       : date >= VAL_END               (reported once; never used for any selection)
Preprocessing (median imputation, scaling, category levels) is fit on the training rows only.
No oversampling is used. Unlabeled transactions are excluded from training and evaluation.
Run: python -m backend.models.train
"""
from __future__ import annotations
import gc, json, time
import duckdb, joblib, numpy as np, pandas as pd
import lightgbm as lgb
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score, precision_recall_curve, brier_score_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from .features import NUMERIC, CATEGORICAL, FEATURES
from ..pipeline.config import DB_PATH, ARTIFACT_DIR, WORK_DIR, SEED, NEG_SAMPLE_RATE, TRAIN_END, VAL_END, MEMORY_LIMIT

LGB_PARAMS = dict(objective="binary", learning_rate=0.05, num_leaves=63, min_child_samples=40, feature_fraction=0.8,
                  bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, seed=SEED, verbose=-1, num_threads=2)
LR_CATS = ["use_chip", "card_brand", "card_type"]


def connect():
    con = duckdb.connect(str(DB_PATH), read_only=True)
    con.execute(f"PRAGMA memory_limit='{MEMORY_LIMIT}'; PRAGMA threads=2; PRAGMA temp_directory='{WORK_DIR / 'tmp'}'")
    return con


def prep(df: pd.DataFrame, levels: dict) -> pd.DataFrame:
    X = df[FEATURES].copy()
    for c in NUMERIC:
        X[c] = pd.to_numeric(X[c], errors="coerce").astype("float32")
    for c in CATEGORICAL:
        X[c] = pd.Categorical(X[c].astype("string"), categories=levels[c])
    return X


def metrics_at(y, p, thr, amount):
    pred = p >= thr
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum()); tn = int((~pred & (y == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0; rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return dict(threshold=float(thr), tp=tp, fp=fp, fn=fn, tn=tn, precision=prec, recall=rec, f1=f1,
                flagged=tp + fp, flagged_amount=float(amount[pred].sum()), fraud_amount_caught=float(amount[pred & (y == 1)].sum()))


def best_f1_threshold(y, p):
    pr, rc, th = precision_recall_curve(y, p)
    f1 = 2 * pr[:-1] * rc[:-1] / np.clip(pr[:-1] + rc[:-1], 1e-12, None)
    i = int(np.argmax(f1)); return float(th[i])


def main():
    t0 = time.time(); log = lambda m: print(f"[{time.time()-t0:5.0f}s] {m}", flush=True)
    con = connect()
    cols = ", ".join(["id", "amount", "is_fraud::INT as y"] + FEATURES)
    thr_pct = int(NEG_SAMPLE_RATE * 100)
    train = con.execute(f"select {cols} from txn where split='train' and (is_fraud or hash(id) % 100 < {thr_pct})").fetchdf()
    levels = {c: sorted(train[c].dropna().astype(str).unique().tolist()) for c in CATEGORICAL}
    Xtr = prep(train, levels); ytr = train["y"].values; n_train = int(len(train))
    w = np.where(ytr == 1, 1.0, 1.0 / NEG_SAMPLE_RATE)  # restore the true base rate
    log(f"train sample {n_train:,} rows, fraud {int(ytr.sum()):,}")
    vs = con.execute(f"select {cols} from txn where split='validation' and (is_fraud or hash(id) % 100 < {thr_pct})").fetchdf()
    Xvs = prep(vs, levels); yvs = vs["y"].values; wvs = np.where(yvs == 1, 1.0, 1.0 / NEG_SAMPLE_RATE)

    num_lr = [c for c in NUMERIC]
    pre = ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), num_lr),
        ("cat", OneHotEncoder(handle_unknown="ignore", categories=[levels[c] for c in LR_CATS]), LR_CATS)])
    lr = Pipeline([("pre", pre), ("clf", LogisticRegression(max_iter=300, C=0.5, random_state=SEED))])
    lr.fit(Xtr[num_lr + LR_CATS].astype({c: str for c in LR_CATS}), ytr, clf__sample_weight=w)
    log("logistic regression fit")
    dtr = lgb.Dataset(Xtr, ytr, weight=w, categorical_feature=CATEGORICAL, free_raw_data=False)
    dvs = lgb.Dataset(Xvs, yvs, weight=wvs, reference=dtr)
    gbm = lgb.train({**LGB_PARAMS, "metric": "average_precision"}, dtr, num_boost_round=800, valid_sets=[dvs],
                    callbacks=[lgb.early_stopping(40, verbose=False)])
    log(f"lightgbm fit, best_iteration={gbm.best_iteration}")
    del dtr, dvs, Xtr, Xvs, train, vs
    gc.collect()

    def lr_score(X): return lr.predict_proba(X[num_lr + LR_CATS].astype({c: str for c in LR_CATS}))[:, 1]
    def gbm_score(X): return gbm.predict(X, num_iteration=gbm.best_iteration)

    out = {}
    for split in ("validation", "test"):
        ids, ys, am, pl, pg, dts = [], [], [], [], [], []
        months = [r[0] for r in con.execute(f"select distinct strftime(date,'%Y-%m') from txn where split='{split}' order by 1").fetchall()]
        for m in months:
            d = con.execute(f"select date, {cols} from txn where split='{split}' and strftime(date,'%Y-%m')='{m}'").fetchdf()
            X = prep(d, levels)
            ids.append(d["id"].values); ys.append(d["y"].values); am.append(d["amount"].values); dts.append(d["date"].values)
            pl.append(lr_score(X)); pg.append(gbm_score(X))
        out[split] = dict(id=np.concatenate(ids), y=np.concatenate(ys), amount=np.concatenate(am), date=np.concatenate(dts),
                          lr=np.concatenate(pl), gbm=np.concatenate(pg))
        log(f"scored {split}: {len(out[split]['y']):,} rows, fraud {int(out[split]['y'].sum()):,}")
    V, T = out["validation"], out["test"]

    iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(V["gbm"], V["y"])
    T["gbm_cal"] = iso.predict(T["gbm"]); V["gbm_cal"] = iso.predict(V["gbm"])
    iso_lr = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(V["lr"], V["y"])
    T["lr_cal"] = iso_lr.predict(T["lr"]); V["lr_cal"] = iso_lr.predict(V["lr"])

    res = dict(config=dict(seed=SEED, train_end=TRAIN_END, val_end=VAL_END, neg_sample_rate=NEG_SAMPLE_RATE,
                           train_rows_sampled=n_train, lgb_best_iteration=int(gbm.best_iteration), lgb_params=LGB_PARAMS,
                           features=FEATURES, validation_rows=int(len(V["y"])), validation_fraud=int(V["y"].sum()),
                           test_rows=int(len(T["y"])), test_fraud=int(T["y"].sum())), models={})
    grid = np.unique(np.concatenate([np.linspace(0, 1, 101), [0.001, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05]]))
    for name, key in (("Logistic Regression (baseline)", "lr_cal"), ("LightGBM", "gbm_cal")):
        thr = best_f1_threshold(V["y"], V[key])  # threshold chosen on VALIDATION only
        pr, rc, th = precision_recall_curve(T["y"], T[key])
        idx = np.unique(np.linspace(0, len(pr) - 1, 300).astype(int))
        q = pd.qcut(pd.Series(T[key]).rank(method="first"), 10, labels=False)
        rel = [dict(bin=int(b), mean_pred=float(T[key][q == b].mean()), observed=float(T["y"][q == b].mean()), n=int((q == b).sum())) for b in range(10)]
        res["models"][name] = dict(
            key=key, selected_threshold_validation=thr,
            test=dict(pr_auc=float(average_precision_score(T["y"], T[key])), roc_auc=float(roc_auc_score(T["y"], T[key])),
                      brier=float(brier_score_loss(T["y"], T[key])), at_threshold=metrics_at(T["y"], T[key], thr, T["amount"])),
            validation=dict(pr_auc=float(average_precision_score(V["y"], V[key])), roc_auc=float(roc_auc_score(V["y"], V[key])),
                            at_threshold=metrics_at(V["y"], V[key], thr, V["amount"])),
            pr_curve=[dict(precision=float(pr[i]), recall=float(rc[i]), threshold=float(th[min(i, len(th) - 1)])) for i in idx],
            threshold_table=[metrics_at(T["y"], T[key], g, T["amount"]) for g in grid],
            reliability=rel)
        r = res["models"][name]
        log(f"{name}: test PR-AUC {r['test']['pr_auc']:.4f} ROC {r['test']['roc_auc']:.4f} thr {thr:.4f} "
            f"P {r['test']['at_threshold']['precision']:.3f} R {r['test']['at_threshold']['recall']:.3f}")
    res["base_rate_test"] = float(T["y"].mean())
    res["raw_vs_calibrated"] = dict(gbm_brier_raw=float(brier_score_loss(T["y"], T["gbm"])), gbm_brier_cal=float(brier_score_loss(T["y"], T["gbm_cal"])),
                                    note="Raw scores come from a model trained on reweighted negatives; isotonic regression fit on validation only.")

    thr = res["models"]["LightGBM"]["selected_threshold_validation"]
    allp = pd.DataFrame({"q": pd.PeriodIndex(pd.to_datetime(np.concatenate([V["date"], T["date"]])), freq="Q").astype(str),
                         "y": np.concatenate([V["y"], T["y"]]), "p": np.concatenate([V["gbm_cal"], T["gbm_cal"]])})
    perf = []
    for qv, g in allp.groupby("q"):
        if g["y"].sum() >= 5:
            perf.append(dict(quarter=qv, n=int(len(g)), fraud=int(g["y"].sum()), pr_auc=float(average_precision_score(g["y"], g["p"])),
                             recall=float(((g["p"] >= thr) & (g["y"] == 1)).sum() / g["y"].sum()),
                             precision=float(((g["p"] >= thr) & (g["y"] == 1)).sum() / max(1, (g["p"] >= thr).sum()))))
    res["performance_over_time"] = perf

    rng = np.random.default_rng(SEED)
    pos = np.where(T["y"] == 1)[0]; neg = np.where(T["y"] == 0)[0]
    sel = np.concatenate([rng.choice(pos, min(1500, len(pos)), replace=False), rng.choice(neg, 6000, replace=False)])
    d = con.execute(f"select {cols} from txn where id in ({','.join(map(str, T['id'][sel][:7500]))})").fetchdf()
    contrib = gbm.predict(prep(d, levels), pred_contrib=True, num_iteration=gbm.best_iteration)[:, :-1]
    imp = np.abs(contrib).mean(axis=0)
    res["global_importance"] = sorted([dict(feature=f, mean_abs_shap=float(v), gain=float(g)) for f, v, g in
                                       zip(FEATURES, imp, gbm.feature_importance("gain"))], key=lambda r: -r["mean_abs_shap"])
    res["importance_note"] = "Mean |TreeSHAP| (log-odds) over a stratified test sample (1,500 fraud + 6,000 non-fraud); not a population average."

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(dict(levels=levels, iso=iso, lr=lr, iso_lr=iso_lr, features=FEATURES, threshold=thr), WORK_DIR / "model_bundle.joblib")
    gbm.save_model(str(WORK_DIR / "lgbm_model.txt"), num_iteration=gbm.best_iteration)
    (ARTIFACT_DIR / "metrics.json").write_text(json.dumps(res, indent=1))
    pd.DataFrame({"id": T["id"], "y": T["y"], "amount": T["amount"], "p": T["gbm_cal"], "p_lr": T["lr_cal"]}).to_parquet(WORK_DIR / "test_preds.parquet")
    pd.DataFrame({"id": V["id"], "y": V["y"], "amount": V["amount"], "p": V["gbm_cal"], "p_lr": V["lr_cal"]}).to_parquet(WORK_DIR / "val_preds.parquet")
    log("done")


if __name__ == "__main__":
    main()
