# Data dictionary

Source: public synthetic card-transaction dataset with four raw files (`transactions_data.csv`, `users_data.csv`, `cards_data.csv`, `mcc_codes.json`) plus `train_fraud_labels.json`. Raw files stay local and are never committed.

## Dataset facts (measured by the pipeline)
- 13,305,915 transactions, 2010-01-01 to 2019-10-31, 1,219 clients, 4,071 cards, 74,831 merchants, 109 MCCs.
- Labels cover 8,914,963 transactions (13,332 fraud, 0.15%). The other 4,390,952 (33%) have no label. Unlabeled is not non-fraud.
- Confirmed fraud value: $1.47M, average $110.
- No duplicate transaction IDs. 660,049 negative amounts (refunds/reversals), 10,639 zero amounts, 10 amounts over $5,000.
- Missing: merchant_state 11.8%, zip 12.4% (both mostly online), errors 98.4% (blank means no error).
- Card number, CVV and address columns exist in the raw files. The warehouse build drops them.

## Warehouse table `txn`
| Group | Columns |
|---|---|
| Transaction | id, date, client_id, card_id, amount, use_chip, merchant_id, merchant_city, merchant_state, zip, mcc, errors |
| Time/flags | hour, dow, is_night, is_online, is_refund |
| Client history (computed from earlier rows only) | client_prior_txn, secs_since_prev_client, client_txn_1h, client_txn_24h, client_amt_mean, client_amt_std, amount_z_client, new_merchant_for_client, new_mcc_for_client |
| Card history | card_prior_txn, secs_since_prev_card |
| Error flags | err_bad_cvv, err_bad_card, err_bad_exp, err_bad_pin, err_insufficient, err_glitch, err_bad_zip |
| Client attributes | current_age, yearly_income, total_debt, credit_score, num_credit_cards |
| Card attributes | card_brand, card_type, card_has_chip, credit_limit, num_cards_issued, card_on_dark_web, acct_age_years, years_since_pin_change, amount_to_limit |
| Label / split | is_fraud (NULL when unlabeled), split (train, validation, test, unlabeled) |
| Model output | risk_score (calibrated probability), risk_raw |

Splits are temporal: train to 2016, validation 2017 to mid-2018, test 2018-07 to 2019-10. Rows with no label are `unlabeled`, so they never feed training or evaluation.

Other tables: `cards`, `users`, `mcc`, `lab` (labels). Case data lives in a separate local SQLite file (`cases.sqlite`).
