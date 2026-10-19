# Limitations

- Synthetic data. Nothing here reflects real fraud behaviour or real customers.
- Labels cover 67% of transactions. Unlabeled rows are excluded from rates and metrics.
- Fraud counts are very uneven by year (37 in 2011, 172 in 2017), which looks like a generator artifact. Quarterly test PR-AUC ranges from 0.027 to 0.155.
- Model quality is modest: LightGBM test PR-AUC 0.051 (base rate 0.18%), ROC-AUC 0.886. At the validation-chosen threshold: precision 10.3%, recall 16.5%.
- Scores for rows before 2017 are in-sample (the model trained on them). Only 2017+ scores are out-of-sample, and only the 2018-07 to 2019-10 test period was held out for the headline metrics.
- Calibrated scores top out near 0.05, so risk bands use data-driven cut-offs (0.003 / 0.01 / 0.03) instead of 0.2 / 0.5 / 0.8.
- Exposure figures are simulated from assumptions (recovery rate, minutes per review). No chargeback, recovery or cost data exists in the dataset.
- Explanations are SHAP-style contributions of the model, not causes of fraud.
- Cases are stored in a local SQLite file for a single user, with a per-case change history. No auth.
- PDF export is the browser's print-to-PDF; there is no server-side PDF.

## Next steps
Obtain real labels for the unlabeled third; add time-based retraining and a champion/challenger check; add graph or device features if available; add auth and audit trail to case management; host the API with a persistent volume.
