"""Risk bands, threshold maths and scenario formulas. Pure functions so they are unit-testable."""
from __future__ import annotations
from dataclasses import dataclass

# Initial defaults for THIS dataset (base rate ~0.15%, calibrated scores top out near 0.046; observed fraud rates per band
# on validation+test are about 0.4% below medium, ~1% medium, ~3% high, ~7% critical).
# The brief's illustrative 0.20/0.50/0.80 bands would label every transaction "low" here. All values are configurable.
DEFAULT_BANDS = (0.003, 0.01, 0.03)   # medium >=, high >=, critical >=
BAND_NAMES = ("low", "medium", "high", "critical")


@dataclass(frozen=True)
class Bands:
    medium: float = DEFAULT_BANDS[0]
    high: float = DEFAULT_BANDS[1]
    critical: float = DEFAULT_BANDS[2]

    def validate(self) -> "Bands":
        if not (0 <= self.medium < self.high < self.critical <= 1):
            raise ValueError("bands must satisfy 0 <= medium < high < critical <= 1")
        return self


def band_of(score: float | None, b: Bands = Bands()) -> str | None:
    if score is None:
        return None
    if score >= b.critical: return "critical"
    if score >= b.high: return "high"
    if score >= b.medium: return "medium"
    return "low"


def band_case_sql(b: Bands) -> str:
    # values are validated floats, formatted (not user-supplied strings)
    return (f"case when risk_score >= {float(b.critical)!r} then 'critical' when risk_score >= {float(b.high)!r} then 'high' "
            f"when risk_score >= {float(b.medium)!r} then 'medium' else 'low' end")


def confusion(y, p, thr: float, amount=None) -> dict:
    """Confusion matrix and derived metrics at a threshold (p >= thr is flagged). y in {0,1}."""
    tp = fp = fn = tn = 0; flagged_amt = caught_amt = 0.0
    for i, (yy, pp) in enumerate(zip(y, p)):
        f = pp >= thr
        a = amount[i] if amount is not None else 0.0
        if f and yy: tp += 1; caught_amt += a
        elif f: fp += 1
        elif yy: fn += 1
        else: tn += 1
        if f: flagged_amt += a
    return _derive(tp, fp, fn, tn, flagged_amt, caught_amt)


def _derive(tp, fp, fn, tn, flagged_amount=0.0, caught_amount=0.0) -> dict:
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    n = tp + fp + fn + tn
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=prec, recall=rec, f1=f1, accuracy=(tp + tn) / n if n else 0.0,
                flagged=tp + fp, flagged_rate=(tp + fp) / n if n else 0.0, flagged_amount=flagged_amount, fraud_amount_caught=caught_amount)


def scenario(flagged: int, flagged_amount: float, flagged_fraud: int, flagged_fraud_amount: float, total_fraud: int,
             review_rate: float, recovery_rate: float, minutes_per_review: float, analyst_hours_per_day: float = 6.0, days: int = 1) -> dict:
    """Scenario arithmetic. review_rate = share of flagged transactions a human reviews (pro-rata).
    All outputs are HYPOTHETICAL estimates on historical data; recovery_rate is an assumption, not an observed value."""
    if not (0 <= review_rate <= 1 and 0 <= recovery_rate <= 1):
        raise ValueError("rates must be within [0, 1]")
    if minutes_per_review < 0 or days < 1 or analyst_hours_per_day <= 0:
        raise ValueError("invalid workload parameters")
    reviewed = flagged * review_rate
    reviewed_amount = flagged_amount * review_rate
    fraud_reviewed = flagged_fraud * review_rate
    fraud_amount_reviewed = flagged_fraud_amount * review_rate
    hours = reviewed * minutes_per_review / 60.0
    return dict(reviewed=reviewed, reviewed_amount=reviewed_amount, fraud_in_reviewed=fraud_reviewed,
                fraud_amount_in_reviewed=fraud_amount_reviewed,
                hypothetical_recovered_amount=fraud_amount_reviewed * recovery_rate,
                review_hours=hours, analyst_days=hours / analyst_hours_per_day,
                share_of_all_fraud_reviewed=(fraud_reviewed / total_fraud) if total_fraud else 0.0)


def psi(expected: list[float], actual: list[float], eps: float = 1e-6) -> float:
    """Population Stability Index over matching bin counts."""
    import math
    if len(expected) != len(actual): raise ValueError("bin counts differ")
    se, sa = sum(expected), sum(actual)
    if se <= 0 or sa <= 0: return float("nan")
    return sum(((a / sa) - (e / se)) * math.log(max(a / sa, eps) / max(e / se, eps)) for e, a in zip(expected, actual))
