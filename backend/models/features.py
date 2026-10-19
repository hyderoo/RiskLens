"""Feature definitions. The fraud label (is_fraud) is never a model input."""
NUMERIC = [
    "amount", "is_online", "hour", "dow", "is_night", "is_refund",
    "client_prior_txn", "secs_since_prev_client", "client_txn_1h", "client_txn_24h",
    "client_amt_mean", "client_amt_std", "amount_z_client",
    "new_merchant_for_client", "new_mcc_for_client", "card_prior_txn", "secs_since_prev_card",
    "err_bad_cvv", "err_bad_card", "err_bad_exp", "err_bad_pin", "err_insufficient", "err_glitch", "err_bad_zip",
    "current_age", "yearly_income", "total_debt", "credit_score", "num_credit_cards",
    "card_has_chip", "credit_limit", "num_cards_issued", "acct_age_years", "years_since_pin_change", "amount_to_limit",
    "card_on_dark_web",
]
CATEGORICAL = ["use_chip", "mcc", "merchant_state", "card_brand", "card_type"]
FEATURES = NUMERIC + CATEGORICAL
FORBIDDEN = {"is_fraud", "split", "id"}  # label / bookkeeping columns, asserted absent in tests
assert not (set(FEATURES) & FORBIDDEN)

DESCRIPTIONS = {
    "amount": "Transaction amount in USD (negative = refund/reversal).",
    "is_online": "1 if merchant_city is 'ONLINE'.",
    "hour": "Hour of day of the transaction.", "dow": "Day of week (0=Sunday).",
    "is_night": "1 if hour is 00-05.", "is_refund": "1 if amount is negative.",
    "client_prior_txn": "Number of earlier transactions by the same client (0 = no history).",
    "secs_since_prev_client": "Seconds since the client's previous transaction (missing if none).",
    "client_txn_1h": "Client transactions in the preceding hour (velocity).",
    "client_txn_24h": "Client transactions in the preceding 24 hours (velocity).",
    "client_amt_mean": "Mean amount of the client's earlier transactions.",
    "client_amt_std": "Std. deviation of the client's earlier amounts.",
    "amount_z_client": "Z-score of the amount vs the client's earlier history (needs >=5 prior transactions).",
    "new_merchant_for_client": "1 if the client never used this merchant before.",
    "new_mcc_for_client": "1 if the client never used this merchant category before.",
    "card_prior_txn": "Earlier transactions on the same card.",
    "secs_since_prev_card": "Seconds since the card's previous transaction.",
    "err_bad_cvv": "Transaction carried a Bad CVV error.", "err_bad_card": "Bad Card Number error.",
    "err_bad_exp": "Bad Expiration error.", "err_bad_pin": "Bad PIN error.",
    "err_insufficient": "Insufficient Balance error.", "err_glitch": "Technical Glitch error.",
    "err_bad_zip": "Bad Zipcode error.",
    "current_age": "Client age (as recorded in the dataset).", "yearly_income": "Client yearly income.",
    "total_debt": "Client total debt.", "credit_score": "Client credit score.", "num_credit_cards": "Cards held by client.",
    "card_has_chip": "Card has a chip.", "credit_limit": "Card credit limit.", "num_cards_issued": "Cards issued on the account.",
    "acct_age_years": "Years between card account opening and transaction.",
    "years_since_pin_change": "Years between last PIN change and transaction.",
    "amount_to_limit": "Amount divided by credit limit.",
    "card_on_dark_web": "Dataset flag: card appears on the dark web (static card attribute).",
    "use_chip": "Channel: swipe / chip / online.", "mcc": "Merchant category code.",
    "merchant_state": "Merchant state (missing for online).", "card_brand": "Card brand.", "card_type": "Credit / debit / prepaid.",
}
