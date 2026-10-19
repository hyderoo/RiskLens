# RiskLens

Fraud and transaction risk analytics on a public synthetic card-transaction dataset (13.3M rows). A DuckDB warehouse, a calibrated LightGBM risk model, a FastAPI backend and a Next.js dashboard with ten pages: executive overview, transaction explorer, fraud analytics, risk scoring, model lab, explainability, exposure scenarios, monitoring, case management and reports.

![Overview](docs/screenshots/overview.png)

## What it does
- **Warehouse**: raw CSV/JSON to DuckDB with leakage-safe features (client and card history computed from earlier rows only). Card numbers, CVVs and addresses are dropped.
- **Model**: temporal split, LightGBM plus a logistic regression baseline, isotonic calibration, threshold chosen on validation, test period scored once.
- **Dashboard**: server-side filtering and pagination over all 13.3M rows, per-transaction explanations, adjustable risk bands, threshold explorer, what-if scoring, drift and data-quality monitoring, case workflow, CSV export and a printable report.
- Every page is tagged **Historical**, **Model** or **Simulated** so facts, estimates and assumptions are never mixed.

## Results (held-out test, 2018-07 to 2019-10, 2,246 frauds, base rate 0.18%)
| Model | PR-AUC | ROC-AUC | Precision | Recall |
|---|---|---|---|---|
| Logistic regression (baseline) | 0.0067 | 0.709 | 1.3% | 10.6% |
| LightGBM, calibrated | 0.0511 | 0.886 | 10.3% | 16.5% |

These numbers are modest and shown as they are. Quarterly PR-AUC ranges from 0.027 to 0.155. Top drivers by mean |SHAP|: mcc, new_merchant_for_client, is_online, use_chip, merchant_state. See [docs/limitations.md](docs/limitations.md) for what this does and does not show.

![Model Lab](docs/screenshots/model-lab.png)
![Transaction Explorer](docs/screenshots/transactions.png)

## Run locally
Requirements: Python 3.10+, Node 20+, about 2 GB RAM, the raw dataset files in `data/` (not included: `transactions_data.csv`, `users_data.csv`, `cards_data.csv`, `mcc_codes.json`, `train_fraud_labels.json`).

```bash
# 1. Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt            # pinned versions: requirements.lock.txt
export RISKLENS_DUCKDB_MEMORY=600MB        # lower (e.g. 250MB) on small machines
python -m backend.pipeline.build_warehouse # build the DuckDB warehouse
python -m backend.models.train             # train, writes backend/artifacts/metrics.json
python -m backend.models.score_all         # write risk scores into the warehouse
python -m pytest backend/tests -q
uvicorn backend.app.main:app --port 8000

# 2. Frontend (new terminal)
cd frontend && cp ../.env.example .env.local   # keep only the NEXT_PUBLIC_API_URL line
npm install
npm run dev                                    # http://localhost:3000
```
Run the heavy steps one at a time on a small machine. See [.env.example](.env.example).

## Docs
[Methodology](docs/methodology.md) · [Data dictionary](docs/data-dictionary.md) · [Architecture and deployment notes](docs/architecture.md) · [Limitations](docs/limitations.md)

## Stack
Next.js 16 (App Router, TypeScript strict), Tailwind, shadcn/ui, Recharts, TanStack Table, Zod; FastAPI, Pydantic, DuckDB, scikit-learn, LightGBM.

## Notes
Portfolio project on synthetic data. Not connected to any bank or live transactions, and not suitable for real fraud decisions.
