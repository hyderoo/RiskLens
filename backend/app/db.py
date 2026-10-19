"""Read-only DuckDB access. Endpoints never accept SQL; every query is built from whitelisted columns with bound parameters."""
from __future__ import annotations
import threading
import os
import duckdb, pandas as pd
from ..pipeline.config import DB_PATH, WORK_DIR

_lock = threading.Lock()
_con: duckdb.DuckDBPyConnection | None = None


def con() -> duckdb.DuckDBPyConnection:
    global _con
    if _con is None:
        if not DB_PATH.exists():
            raise FileNotFoundError("warehouse")
        _con = duckdb.connect(str(DB_PATH), read_only=True)
        _con.execute(f"PRAGMA memory_limit='{os.environ.get('RISKLENS_DUCKDB_MEMORY', '700MB')}'; PRAGMA threads=2; PRAGMA temp_directory='{WORK_DIR / 'tmp'}'")
    return _con


def query(sql: str, params: list | None = None) -> pd.DataFrame:
    with _lock:
        return con().execute(sql, params or []).fetchdf()


def rows(sql: str, params: list | None = None) -> list[dict]:
    df = query(sql, params)
    df = df.astype(object).where(pd.notna(df), None)
    return df.to_dict("records")


def scalar(sql: str, params: list | None = None):
    with _lock:
        r = con().execute(sql, params or []).fetchone()
    return r[0] if r else None
