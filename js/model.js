// =====================================================================
// model.js: the pricing math. Pure functions only (no DOM), so the same
// numbers drive the home page receipt, the plan table and every chart.
//
// Sources of each input:
//   - Interchange rates: providers.json -> interchange_benchmarks (Visa schedule, cited)
//   - Competitor prices: providers.json -> fees (published pricing pages, cited)
//   - FairSwipe plans and cost assumptions: startup.json (scenario inputs, editable)
// All percentages are stored as percents (2.9 means 2.9%) and divided by 100 exactly once, here.
// =====================================================================

const pct = (x) => x / 100;

// Finds one fee row by id. Throwing early beats silently charting $0 if the data file drifts.
function fee(providers, id) {
  const row = providers.fees.find((f) => f.id === id);
  if (!row) throw new Error(`providers.json is missing fee row "${id}"`);
  return row;
}
function benchmark(providers, id) {
  const row = providers.interchange_benchmarks.find((b) => b.id === id);
  if (!row) throw new Error(`providers.json is missing benchmark "${id}"`);
  return row;
}

// Blended interchange for one transaction.
// Credit uses the card-present or card-not-present Visa rate; debit uses the regulated
// (Durbin) rate plus the fraud-prevention adjustment. The blend is weighted by debit share.
// Gotcha: on very small sales the debit fixed fee (21 cents + 1 cent) can make debit MORE
// expensive than credit, which is why the coffee-shop scenario behaves differently.
export function interchange(providers, assumptions, { ticket, channel, debitShare }) {
  const credit = benchmark(providers, channel === "in_person" ? "ic_visa_credit_cp" : "ic_visa_credit_cnp");
  const debit = benchmark(providers, "ic_regulated_debit");
  const creditCost = ticket * pct(credit.rate_pct) + credit.fixed_usd;
  const debitCost = ticket * pct(debit.rate_pct) + debit.fixed_usd + assumptions.debit_fraud_adjustment_usd;
  const d = pct(debitShare);
  return (1 - d) * creditCost + d * debitCost;
}

// Full economics of one FairSwipe plan for one scenario.
// Returns per-transaction values plus monthly totals, so callers never redo the math.
export function planEconomics(providers, assumptions, plan, scenario) {
  const { ticket, volume } = scenario;
  const txns = volume / ticket;                                  // transactions per month
  const ic = interchange(providers, assumptions, scenario);
  const network = ticket * pct(assumptions.network_fee_pct);
  const cost = assumptions.processing_cost_usd;
  const monthlyShare = txns > 0 ? plan.monthly_fee_usd / txns : 0; // subscription spread over each sale

  // Flat plans charge one blended price; interchange-plus plans pass card costs through
  // and add FairSwipe's markup on top.
  const markup = ticket * pct(plan.rate_pct) + plan.fixed_usd;
  const price = (plan.type === "ic_plus" ? ic + network + markup : markup) + monthlyShare;
  const margin = price - ic - network - cost;

  return {
    plan, price, ic, network, cost, margin, txns,
    effectiveRate: (price / ticket) * 100,
    marginPct: (margin / ticket) * 100,
    monthlyProfit: margin * txns,
    monthlyPrice: price * txns,
  };
}

// What each competitor would charge the same merchant for one sale.
// Stripe, Square (Free plan) and PayPal use their published flat rate for the channel.
// Adyen is interchange-plus: $0.13 processing fee + interchange + network fee + 0.60% (Visa/Mastercard).
// Adyen's minimum monthly invoice is unpublished, so it is excluded (stated on the page).
export function rivalPrices(providers, assumptions, scenario) {
  const { ticket, channel } = scenario;
  const flat = (id) => { const f = fee(providers, id); return ticket * pct(f.rate_pct) + f.fixed_usd; };
  const ic = interchange(providers, assumptions, scenario);
  const network = ticket * pct(assumptions.network_fee_pct);
  const adyenMarkup = fee(providers, "adyen_visa");
  const adyenFixed = fee(providers, "adyen_processing");
  const inPerson = channel === "in_person";

  return [
    { id: "stripe", name: "Stripe", price: flat(inPerson ? "stripe_inperson" : "stripe_online"), basis: inPerson ? "2.7% + 5¢ in person" : "2.9% + 30¢ online" },
    { id: "square", name: "Square", price: flat(inPerson ? "square_free_inperson" : "square_free_online"), basis: inPerson ? "2.6% + 15¢ in person (Free plan)" : "3.3% + 30¢ online (Free plan)" },
    { id: "paypal", name: "PayPal", price: flat(inPerson ? "paypal_zettle_inperson" : "paypal_card_online"), basis: inPerson ? "2.29% + 9¢ (Zettle reader)" : "2.99% + 49¢ card payments" },
    { id: "adyen", name: "Adyen", price: adyenFixed.fixed_usd + ic + network + ticket * pct(adyenMarkup.rate_pct), basis: "$0.13 + interchange + network fee + 0.60%" },
  ].map((r) => ({ ...r, effectiveRate: (r.price / ticket) * 100 }));
}

// Recommended-plan finder (no machine learning, just a transparent rule).
// It answers the merchant's question, because the merchant is the one choosing:
//   1. Keep only plans that are profitable for FairSwipe (a plan that loses money is not offered).
//   2. Pick the one that is cheapest for the merchant. Given a menu, that is the plan they would choose.
//   3. Report whether that plan also undercuts the cheapest competitor.
// Gotcha: ranking by FairSwipe's profit instead would recommend a pricier plan to a merchant
// who qualifies for a cheaper one, which no real merchant would accept.
export function recommend(results, rivals) {
  const cheapest = rivals.reduce((a, b) => (b.price < a.price ? b : a));
  const profitable = results.filter((r) => r.margin > 0);
  const pool = profitable.length ? profitable : results;
  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  return { best, cheapest, undercuts: best.price < cheapest.price && best.margin > 0 };
}

// Volume curve for the line chart (decision 3C).
// The question is "at what size does each plan become the better deal for the merchant?",
// so the curve tracks the merchant's effective rate, with FairSwipe's monthly profit carried
// alongside for the tooltip and table.
// Gotcha: a monthly fee is revenue to FairSwipe, so it never makes a plan unprofitable.
// What it does is push the MERCHANT's effective rate up at low volume, which is where
// subscription plans lose the deal, not the money.
export const VOLUME_STEPS = [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000];
export function volumeCurve(providers, assumptions, plan, scenario) {
  return VOLUME_STEPS.map((v) => {
    const e = planEconomics(providers, assumptions, plan, { ...scenario, volume: v });
    return { volume: v, rate: e.effectiveRate, profit: e.monthlyProfit };
  });
}
