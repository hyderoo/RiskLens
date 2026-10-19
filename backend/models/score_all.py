"""Score every transaction with the trained LightGBM + isotonic calibration and store the result in the warehouse.
Rows in the training period are in-sample scores; the `split` column marks which rows are honest (validation/test) or not.
Run: python -m backend.models.score_all
"""
import time, joblib, duckdb, numpy as np, pandas as pd, lightgbm as lgb
from .features import FEATURES
from .train import prep
from ..pipeline.config import DB_PATH, WORK_DIR, MEMORY_LIMIT


def main():
    t0 = time.time()
    b = joblib.load(WORK_DIR / "model_bundle.joblib"); gbm = lgb.Booster(model_file=str(WORK_DIR / "lgbm_model.txt"))
    con = duckdb.connect(str(DB_PATH)); con.execute(f"PRAGMA memory_limit='{MEMORY_LIMIT}'; PRAGMA threads=2; PRAGMA temp_directory='{WORK_DIR/'tmp'}'")
    con.execute("create or replace table score(id BIGINT, p FLOAT, p_raw FLOAT)")
    months = [r[0] for r in con.execute("select distinct strftime(date,'%Y-%m') from txn order by 1").fetchall()]
    cols = ", ".join(["id"] + FEATURES)
    for m in months:
        d = con.execute(f"select {cols} from txn where strftime(date,'%Y-%m')='{m}'").fetchdf()
        raw = gbm.predict(prep(d, b["levels"]))
        out = pd.DataFrame({"id": d["id"].values, "p": b["iso"].predict(raw).astype("float32"), "p_raw": raw.astype("float32")})
        con.register("o", out); con.execute("insert into score select id, p, p_raw from o"); con.unregister("o")
    print(f"scored {len(months)} months in {time.time()-t0:.0f}s", flush=True)
    con.execute("create or replace table txn_scored as select t.*, s.p as risk_score, s.p_raw as risk_raw from txn t join score s using(id) order by t.date, t.id")
    con.execute("drop table txn"); con.execute("alter table txn_scored rename to txn"); con.execute("drop table score")
    print(con.execute("select split, count(*), avg(risk_score), max(risk_score) from txn group by 1 order by 1").fetchall())
    print(f"done {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
