"""Lightweight case management persisted in a local SQLite file (git-ignored). Local-development persistence only."""
from __future__ import annotations
import sqlite3, threading
from datetime import datetime, timezone
from ..pipeline.config import CASES_DB, WORK_DIR

_lock = threading.Lock()
STATUSES = ("open", "in_review", "escalated", "closed")
DISPOSITIONS = ("none", "confirmed_fraud", "false_positive", "inconclusive")
SEVERITIES = ("low", "medium", "high", "critical")


def _c():
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(CASES_DB), check_same_thread=False); c.row_factory = sqlite3.Row
    c.executescript("""create table if not exists cases(id integer primary key autoincrement, txn_id integer not null, severity text not null,
      status text not null, disposition text not null, notes text not null default '', model_score real, created_at text not null, updated_at text not null);
      create table if not exists case_history(id integer primary key autoincrement, case_id integer not null, at text not null, field text not null, old text, new text);""")
    return c


def _now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create(txn_id: int, severity: str, notes: str, model_score: float | None) -> dict:
    with _lock, _c() as c:
        cur = c.execute("insert into cases(txn_id,severity,status,disposition,notes,model_score,created_at,updated_at) values(?,?,?,?,?,?,?,?)",
                        (txn_id, severity, "open", "none", notes, model_score, _now(), _now()))
        c.execute("insert into case_history(case_id,at,field,old,new) values(?,?,?,?,?)", (cur.lastrowid, _now(), "created", None, "open"))
        return get(cur.lastrowid, c)


def get(case_id: int, c=None) -> dict | None:
    c = c or _c()
    r = c.execute("select * from cases where id=?", (case_id,)).fetchone()
    if not r: return None
    d = dict(r); d["history"] = [dict(h) for h in c.execute("select at,field,old,new from case_history where case_id=? order by id", (case_id,))]
    return d


def listing(status: str | None = None, limit: int = 100) -> list[dict]:
    with _lock, _c() as c:
        q = "select * from cases" + (" where status=?" if status else "") + " order by updated_at desc limit ?"
        return [dict(r) for r in c.execute(q, ([status] if status else []) + [limit])]


def update(case_id: int, **fields) -> dict | None:
    allowed = {"severity", "status", "disposition", "notes"}
    with _lock, _c() as c:
        cur = c.execute("select * from cases where id=?", (case_id,)).fetchone()
        if not cur: return None
        for k, v in fields.items():
            if k not in allowed or v is None or cur[k] == v: continue
            c.execute(f"update cases set {k}=?, updated_at=? where id=?", (v, _now(), case_id))   # k is whitelisted above
            c.execute("insert into case_history(case_id,at,field,old,new) values(?,?,?,?,?)",
                      (case_id, _now(), k, str(cur[k]), "(edited)" if k == "notes" else str(v)))
        return get(case_id, c)
