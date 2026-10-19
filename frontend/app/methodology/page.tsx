import { PageHeader, Panel } from "@/components/kit";

const S = ({ t, children }: { t: string; children: React.ReactNode }) => <Panel title={t}><div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div></Panel>;
export default function Methodology() {
  return (
    <>
      <PageHeader title="Methodology" subtitle="How scores, bands and metrics are produced, and what they cannot tell you." />
      <div className="max-w-3xl space-y-4">
        <S t="Data and labels"><p>The dataset is a public synthetic card-transactions set. 13.3M transactions; about a third have no fraud label. Unlabeled rows are excluded from every fraud rate and are never treated as non-fraud. Card numbers, CVVs and addresses are dropped when the warehouse is built.</p></S>
        <S t="Fraud risk"><p>Confirmed fraud is the dataset&apos;s label. Rates are reported with counts and flagged as small-sample where too few labeled rows exist. Associations such as channel or merchant category are descriptive, not causal.</p></S>
        <S t="Operational risk"><p>Review workload is a function of the flag threshold. The Exposure page converts flags into reviews and analyst hours using assumptions you set (minutes per review, recovery rate). Those assumptions are not observed in the data and the result is labeled simulated.</p></S>
        <S t="Model risk"><p>Training uses a temporal split (train to 2016, validation 2017 to mid-2018, test mid-2018 to 2019). Preprocessing is fit on training rows only; negatives are down-sampled with weights; the threshold is picked on validation; the test period is scored once. Probabilities are isotonic-calibrated. Performance varies widely by quarter, scores before 2017 are in-sample, and PR-AUC is modest. Do not use this model for real decisions.</p></S>
        <S t="Risk bands"><p>Bands cut the calibrated probability at configurable points (defaults 0.003, 0.01, 0.03). They are chosen from this dataset&apos;s score distribution, not an industry standard. The commonly used 0.2 / 0.5 / 0.8 would classify everything as Low here.</p></S>
        <S t="Provenance tags"><p>Every page carries a tag: Historical (dataset facts), Model (estimates from the trained model) or Simulated (what-if scenarios with stated assumptions).</p></S>
      </div>
    </>
  );
}
