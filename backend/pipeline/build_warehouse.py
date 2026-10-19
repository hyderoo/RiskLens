"""Build the analytical warehouse (DuckDB) from the raw Kaggle files.

- Raw files are only read, never modified.
- Card numbers, CVV and street addresses are NOT loaded into the warehouse.
- Behavioural features use only information available at or before each transaction (past rows per client/card).
- Labels come from train_fraud_labels.json and cover a subset of transactions; the rest are 'unlabeled' (NULL), not non-fraud.
Run: python -m backend.pipeline.build_warehouse
"""
from __future__ import annotations
import json, re, sys, time
import duckdb
from .config import DATA_DIR, WORK_DIR, DB_PATH, RAW_FILES, MEMORY_LIMIT, TRAIN_END, VAL_END

LABEL_RE = re.compile(rb'"(\d+)":\s*"(Yes|No)"')


def labels_json_to_csv(src, dst) -> int:
    """Stream the large {"target": {id: "Yes"/"No"}} JSON into CSV without loading it in memory."""
    n, buf = 0, b""
    with open(src, "rb") as f, open(dst, "w") as out:
        out.write("id,label\n")
        while True:
            chunk = f.read(1 << 24)
            if not chunk:
                break
            buf += chunk
            cut = buf.rfind(b",")
            if cut < 0:
                continue
            part, buf = buf[:cut], buf[cut:]
            for m in LABEL_RE.finditer(part):
                out.write(f"{m.group(1).decode()},{m.group(2).decode()}\n"); n += 1
        for m in LABEL_RE.finditer(buf):
            out.write(f"{m.group(1).decode()},{m.group(2).decode()}\n"); n += 1
    return n


FEATURE_SQL = """
select
  t.id, t.date, t.client_id, t.card_id, t.amount, t.use_chip, t.merchant_id, t.merchant_city, t.merchant_state, t.zip, t.mcc, t.errors,
  (t.merchant_city = 'ONLINE')::INT as is_online,
  hour(t.date) as hour, dayofweek(t.date) as dow,
  (hour(t.date) < 6)::INT as is_night,
  (t.amount < 0)::INT as is_refund,
  row_number() over w_c - 1 as client_prior_txn,
  epoch(t.date) - epoch(lag(t.date) over w_c) as secs_since_prev_client,
  count(*) over (partition by t.client_id order by t.date range between interval 1 hour preceding and current row) - 1 as client_txn_1h,
  count(*) over (partition by t.client_id order by t.date range between interval 24 hour preceding and current row) - 1 as client_txn_24h,
  avg(t.amount) over w_cp as client_amt_mean,
  stddev_samp(t.amount) over w_cp as client_amt_std,
  case when count(*) over w_cp >= 5 and stddev_samp(t.amount) over w_cp > 0
       then (t.amount - avg(t.amount) over w_cp) / stddev_samp(t.amount) over w_cp end as amount_z_client,
  (row_number() over (partition by t.client_id, t.merchant_id order by t.date, t.id) = 1)::INT as new_merchant_for_client,
  (row_number() over (partition by t.client_id, t.mcc order by t.date, t.id) = 1)::INT as new_mcc_for_client,
  row_number() over w_card - 1 as card_prior_txn,
  epoch(t.date) - epoch(lag(t.date) over w_card) as secs_since_prev_card,
  coalesce(t.errors like '%Bad CVV%', false)::INT as err_bad_cvv,
  coalesce(t.errors like '%Bad Card Number%', false)::INT as err_bad_card,
  coalesce(t.errors like '%Bad Expiration%', false)::INT as err_bad_exp,
  coalesce(t.errors like '%Bad PIN%', false)::INT as err_bad_pin,
  coalesce(t.errors like '%Insufficient Balance%', false)::INT as err_insufficient,
  coalesce(t.errors like '%Technical Glitch%', false)::INT as err_glitch,
  coalesce(t.errors like '%Bad Zipcode%', false)::INT as err_bad_zip,
  u.current_age, u.yearly_income, u.total_debt, u.credit_score, u.num_credit_cards,
  c.card_brand, c.card_type, (c.has_chip = 'YES')::INT as card_has_chip, c.credit_limit, c.num_cards_issued,
  (c.card_on_dark_web = 'Yes')::INT as card_on_dark_web,
  year(t.date) - c.acct_open_year as acct_age_years, year(t.date) - c.year_pin_last_changed as years_since_pin_change,
  t.amount / nullif(c.credit_limit, 0) as amount_to_limit
from tx t
join users u on u.id = t.client_id
join cards c on c.id = t.card_id
where t.client_id % {mod} = {rem}
window w_c as (partition by t.client_id order by t.date, t.id),
       w_cp as (partition by t.client_id order by t.date, t.id rows between unbounded preceding and 1 preceding),
       w_card as (partition by t.card_id order by t.date, t.id)
"""


def main() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    log = lambda m: print(f"[{time.time()-t0:6.0f}s] {m}", flush=True)
    labels_csv = WORK_DIR / "labels.csv"
    if not labels_csv.exists():
        log(f"labels: {labels_json_to_csv(DATA_DIR / RAW_FILES['labels'], labels_csv):,} rows")
    con = duckdb.connect(str(DB_PATH))
    con.execute(f"PRAGMA memory_limit='{MEMORY_LIMIT}'; PRAGMA threads=2; PRAGMA temp_directory='{WORK_DIR / 'tmp'}'")
    csv_opts = "header=true, quote='\"', escape='\"', delim=','"
    con.execute(f"""create or replace table tx as select id::BIGINT id, date::TIMESTAMP date, client_id::INT client_id, card_id::INT card_id,
      replace(replace(amount,'$',''),',','')::DOUBLE amount, use_chip, merchant_id::INT merchant_id, merchant_city, merchant_state, zip, mcc, errors
      from read_csv('{DATA_DIR / RAW_FILES['transactions']}', {csv_opts}, types={{'zip':'VARCHAR','mcc':'VARCHAR','errors':'VARCHAR'}})""")
    log("tx loaded")
    con.execute(f"""create or replace table users as select id::INT id, current_age, birth_year, gender,
      replace(per_capita_income::VARCHAR,'$','')::DOUBLE per_capita_income, replace(yearly_income::VARCHAR,'$','')::DOUBLE yearly_income,
      replace(total_debt::VARCHAR,'$','')::DOUBLE total_debt, credit_score, num_credit_cards
      from read_csv('{DATA_DIR / RAW_FILES['users']}', {csv_opts})""")  # address, lat/long intentionally dropped
    con.execute(f"""create or replace table cards as select id::INT id, client_id, card_brand, card_type, has_chip, num_cards_issued,
      replace(credit_limit::VARCHAR,'$','')::DOUBLE credit_limit, year(strptime(acct_open_date,'%m/%Y')) acct_open_year, year_pin_last_changed, card_on_dark_web
      from read_csv('{DATA_DIR / RAW_FILES['cards']}', {csv_opts})""")  # card_number and cvv intentionally dropped
    mcc_rows = list(json.load(open(DATA_DIR / RAW_FILES["mcc"])).items())
    con.execute("create or replace table mcc(code VARCHAR, description VARCHAR)")
    con.executemany("insert into mcc values (?, ?)", mcc_rows)
    con.execute(f"create or replace table lab as select id::BIGINT id, (label='Yes') is_fraud from read_csv('{labels_csv}', header=true)")
    log("dims + labels loaded")
    mod = 20
    con.execute("drop table if exists feat_stage")
    for rem in range(mod):
        sql = FEATURE_SQL.format(mod=mod, rem=rem)
        if rem == 0:
            con.execute("create table feat_stage as " + sql)
        else:
            con.execute("insert into feat_stage " + sql)
        log(f"features batch {rem+1}/{mod}")
    con.execute(f"""create or replace table txn as select f.*, l.is_fraud,
      case when l.is_fraud is null then 'unlabeled' when f.date < timestamp '{TRAIN_END}' then 'train'
           when f.date < timestamp '{VAL_END}' then 'validation' else 'test' end as split
      from feat_stage f left join lab l using(id) order by f.date, f.id""")
    con.execute("drop table feat_stage")
    log(con.execute("select split, count(*), sum(is_fraud::INT) from txn group by 1 order by 1").fetchall())
    con.close()


if __name__ == "__main__":
    sys.exit(main())
