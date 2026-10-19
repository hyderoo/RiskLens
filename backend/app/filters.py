"""Validated filter model shared by every endpoint. Translates to a parameterised WHERE clause."""
from __future__ import annotations
from datetime import date, timedelta
from typing import Literal, Optional
from fastapi import Query, HTTPException
from pydantic import BaseModel, Field, model_validator, ValidationError

LabelFilter = Literal["all", "fraud", "nonfraud", "labeled", "unlabeled"]


class Filters(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    amount_min: Optional[float] = Field(None, ge=-1_000_000, le=1_000_000)
    amount_max: Optional[float] = Field(None, ge=-1_000_000, le=1_000_000)
    label: LabelFilter = "all"
    score_min: Optional[float] = Field(None, ge=0, le=1)
    score_max: Optional[float] = Field(None, ge=0, le=1)
    use_chip: Optional[str] = Field(None, max_length=40)
    mcc: Optional[str] = Field(None, pattern=r"^\d{3,5}$")
    state: Optional[str] = Field(None, max_length=4)
    client_id: Optional[int] = Field(None, ge=0)
    card_id: Optional[int] = Field(None, ge=0)
    txn_id: Optional[int] = Field(None, ge=0)
    split: Optional[Literal["train", "validation", "test", "unlabeled"]] = None

    @model_validator(mode="after")
    def ordered_ranges(self):
        for lo, hi in ((self.date_from, self.date_to), (self.amount_min, self.amount_max), (self.score_min, self.score_max)):
            if lo is not None and hi is not None and lo > hi:
                raise ValueError("Range start must not exceed range end")
        return self

    def where(self) -> tuple[str, list]:
        c: list[str] = []; p: list = []
        if self.date_from: c.append("date >= ?"); p.append(str(self.date_from))
        if self.date_to: c.append("date < ?"); p.append(str(self.date_to + timedelta(days=1)))
        if self.amount_min is not None: c.append("amount >= ?"); p.append(self.amount_min)
        if self.amount_max is not None: c.append("amount <= ?"); p.append(self.amount_max)
        if self.label == "fraud": c.append("is_fraud = true")
        elif self.label == "nonfraud": c.append("is_fraud = false")
        elif self.label == "labeled": c.append("is_fraud is not null")
        elif self.label == "unlabeled": c.append("is_fraud is null")
        if self.score_min is not None: c.append("risk_score >= ?"); p.append(self.score_min)
        if self.score_max is not None: c.append("risk_score < ?"); p.append(self.score_max)
        if self.use_chip: c.append("use_chip = ?"); p.append(self.use_chip)
        if self.mcc: c.append("mcc = ?"); p.append(self.mcc)
        if self.state: c.append("merchant_state = ?"); p.append(self.state.upper())
        if self.client_id is not None: c.append("client_id = ?"); p.append(self.client_id)
        if self.card_id is not None: c.append("card_id = ?"); p.append(self.card_id)
        if self.txn_id is not None: c.append("id = ?"); p.append(self.txn_id)
        if self.split: c.append("split = ?"); p.append(self.split)
        return (" where " + " and ".join(c)) if c else "", p


def filters_dep(
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    amount_min: Optional[float] = Query(None), amount_max: Optional[float] = Query(None),
    label: LabelFilter = "all", score_min: Optional[float] = Query(None, ge=0, le=1), score_max: Optional[float] = Query(None, ge=0, le=1),
    use_chip: Optional[str] = Query(None, max_length=40), mcc: Optional[str] = Query(None, pattern=r"^\d{3,5}$"),
    state: Optional[str] = Query(None, max_length=4), client_id: Optional[int] = Query(None, ge=0),
    card_id: Optional[int] = Query(None, ge=0), txn_id: Optional[int] = Query(None, ge=0),
    split: Optional[Literal["train", "validation", "test", "unlabeled"]] = None,
) -> Filters:
    try:
        return Filters(date_from=date_from, date_to=date_to, amount_min=amount_min, amount_max=amount_max, label=label,
                   score_min=score_min, score_max=score_max, use_chip=use_chip, mcc=mcc, state=state, client_id=client_id,
                   card_id=card_id, txn_id=txn_id, split=split)

    except ValidationError:
        raise HTTPException(422, "Invalid filters: check numeric limits and range order")
