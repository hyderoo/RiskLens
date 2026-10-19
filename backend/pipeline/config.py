"""Central paths and constants. Raw data is read-only and lives outside the repo."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("RISKLENS_DATA_DIR", ROOT / "data"))          # raw Kaggle files (never modified)
WORK_DIR = Path(os.environ.get("RISKLENS_WORK_DIR", ROOT / "data" / "work"))  # derived warehouse (git-ignored)
ARTIFACT_DIR = ROOT / "backend" / "artifacts"
DB_PATH = WORK_DIR / "risklens.duckdb"
CASES_DB = WORK_DIR / "cases.sqlite"
MEMORY_LIMIT = os.environ.get("RISKLENS_DUCKDB_MEMORY", "600MB")
SEED = 42

# Temporal split on transaction time (labeled rows only). Fit on train, choose threshold on validation, report on test.
TRAIN_END = "2017-01-01"   # train: date <  2017-01-01
VAL_END = "2018-07-01"     # validation: 2017-01-01 <= date < 2018-07-01 ; test: date >= 2018-07-01
NEG_SAMPLE_RATE = 0.05     # fraction of non-fraud training rows kept (fraud rows always kept)

RAW_FILES = {
    "transactions": "transactions_data.csv",
    "users": "users_data.csv",
    "cards": "cards_data.csv",
    "mcc": "mcc_codes.json",
    "labels": "train_fraud_labels.json",
}
