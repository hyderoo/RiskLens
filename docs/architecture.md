# Architecture

```
raw CSV/JSON  ->  pipeline/build_warehouse.py  ->  DuckDB (txn, cards, users, mcc)
                                                       |
                 models/train.py  (LightGBM + LR baseline, isotonic calibration)
                                                       |
                 models/score_all.py  ->  risk_score written into txn
                                                       |
                 app/main.py (FastAPI)  <-  Next.js dashboard (App Router)
                         |
                 cases.sqlite (analyst cases)
```

- **Warehouse**: DuckDB, built once from raw files. Feature engineering uses only past rows per client/card (no leakage from the future).
- **Model**: temporal split; preprocessing fit on train rows; negatives down-sampled with weights; threshold chosen on validation; test scored once. Metrics are written to `backend/artifacts/metrics.json` (small, committed). The trained model and predictions stay in `data/work` (git-ignored).
- **API**: FastAPI with Pydantic validation. Filters, sorting and pagination run in DuckDB, never in the browser. Endpoints cover overview, transactions (+CSV export, detail with per-transaction contributions), analytics, risk bands and what-if scoring, model lab, scenario, monitoring, cases, recommendations and report.
- **Frontend**: Next.js 16, TypeScript strict, Tailwind, shadcn/ui, Recharts, TanStack Table v8, Zod. Every page is tagged Historical, Model or Simulated.
- **Cases**: local SQLite, single user. Not a production case system.

## Deployment notes
The API needs the DuckDB file and model bundle, so it is meant to run locally or on a host with a persistent disk and about 2 GB RAM. The frontend deploys to Vercel with `NEXT_PUBLIC_API_URL` pointing at the API. Without a hosted API the dashboard shows error states, so the README recommends a local run for demos. No hosting is configured in this repo.
