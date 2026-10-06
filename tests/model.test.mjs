// =====================================================================
// tests/model.test.mjs: checks the pricing model against hand-calculated values.
// Uses Node's built-in test runner, so there is nothing to install:
//     npm test   (or: node --test tests/model.test.mjs)
// Why test only model.js: every number on the site flows through it. If the math is
// right here, the receipt, table, KPIs and charts are right, because they never redo it.
// =====================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interchange, planEconomics, rivalPrices, recommend, volumeCurve, VOLUME_STEPS } from "../js/model.js";
import { referenceSale } from "../js/common.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const providers = load("providers.json");
const startup = load("startup.json");
const A = startup.assumptions;
const plan = (id) => startup.plans.find((p) => p.id === id);
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: got ${actual}, expected ${expected}`);

const ONLINE = { ticket: 80, channel: "online", debitShare: 40, volume: 50000 };   // the Online store profile
const COFFEE = { ticket: 8, channel: "in_person", debitShare: 60, volume: 20000 };

test("blended interchange matches the Visa schedule by hand", () => {
  // credit: 80 * 1.89% + 0.10 = 1.612 ; debit: 80 * 0.05% + 0.21 + 0.01 = 0.26
  // blend: 0.6 * 1.612 + 0.4 * 0.26 = 1.0712
  close(interchange(providers, A, ONLINE), 1.0712, "online interchange");
});

test("small debit sales cost more than credit (Durbin fixed fee effect)", () => {
  const credit = interchange(providers, A, { ...COFFEE, debitShare: 0 });
  const debit = interchange(providers, A, { ...COFFEE, debitShare: 100 });
  assert.ok(debit > credit, "debit should be pricier than credit on an $8 sale");
});

test("interchange-plus plan price and margin", () => {
  const e = planEconomics(providers, A, plan("growth"), ONLINE);
  // price = interchange 1.0712 + network 0.104 + markup 0.50 + 49 / 625 sales
  close(e.price, 1.0712 + 0.104 + 0.5 + 49 / 625, "growth price");
  close(e.margin, 0.5 + 49 / 625 - 0.04, "growth margin = markup + fee share - processing cost");
  close(e.monthlyProfit, e.margin * 625, "monthly profit");
});

test("flat plan ignores interchange in its price", () => {
  const e = planEconomics(providers, A, plan("starter"), ONLINE);
  close(e.price, 80 * 0.0275 + 0.15, "starter price");
});

test("competitor prices follow published rates", () => {
  const r = Object.fromEntries(rivalPrices(providers, A, ONLINE).map((x) => [x.id, x.price]));
  close(r.stripe, 2.62, "Stripe 2.9% + 30c");
  close(r.square, 80 * 0.033 + 0.30, "Square Free online 3.3% + 30c");
  close(r.paypal, 80 * 0.0299 + 0.49, "PayPal 2.99% + 49c");
  close(r.adyen, 0.13 + 1.0712 + 0.104 + 0.48, "Adyen 0.13 + IC + network + 0.60%");
});

test("finder picks the plan the merchant would choose: the cheapest profitable one", () => {
  const ref = referenceSale(startup);   // $80 online, 40% debit, $50K a month
  const results = startup.plans.map((p) => planEconomics(providers, A, p, ref));
  const { best, cheapest, undercuts } = recommend(results, rivalPrices(providers, A, ref));
  assert.equal(cheapest.id, "adyen");
  assert.equal(best.plan.id, "growth");
  assert.equal(undercuts, true);
});

test("large merchants are steered to Scale, matching its plan description", () => {
  const b2b = startup.merchants.find((m) => m.id === "b2b");
  const s = { ticket: b2b.avg_ticket_usd, channel: b2b.channel, debitShare: b2b.debit_share_pct, volume: b2b.monthly_volume_usd };
  const results = startup.plans.map((p) => planEconomics(providers, A, p, s));
  assert.equal(recommend(results, rivalPrices(providers, A, s)).best.plan.id, "scale");
});

test("finder admits when no plan can beat the market", () => {
  // Coffee shop: card costs ($0.231) plus FairSwipe's 4-cent processing cost exceed Stripe's in-person price ($0.266)
  const results = startup.plans.map((p) => planEconomics(providers, A, p, COFFEE));
  const { undercuts, cheapest, best } = recommend(results, rivalPrices(providers, A, COFFEE));
  assert.equal(undercuts, false);
  assert.equal(cheapest.id, "stripe");
  const cheapestProfitable = results.filter((r) => r.margin > 0).reduce((a, b) => (b.price < a.price ? b : a));
  assert.equal(best.plan.id, cheapestProfitable.plan.id);
});

test("the reference sale is the Online store profile", () => {
  assert.deepEqual(referenceSale(startup), ONLINE);
});

test("finder says when a better-priced plan could still win", () => {
  // Online store at $10K: Growth's $49 fee lifts its price above Adyen, but FairSwipe's
  // cost floor is well below Adyen, so the page must not claim winning is impossible.
  const s = { ...ONLINE, volume: 10000 };
  const results = startup.plans.map((p) => planEconomics(providers, A, p, s));
  const { undercuts, cheapest } = recommend(results, rivalPrices(providers, A, s));
  const floor = results[0].ic + results[0].network + results[0].cost;
  assert.equal(undercuts, false);
  assert.ok(floor < cheapest.price, "cost floor sits below the cheapest rival");
});

test("subscription plans are expensive for small merchants and cheapest for large ones", () => {
  const curve = volumeCurve(providers, A, plan("scale"), ONLINE);
  const r = Object.fromEntries(rivalPrices(providers, A, ONLINE).map((x) => [x.id, x.effectiveRate]));
  assert.equal(curve.length, VOLUME_STEPS.length);
  assert.ok(curve[0].rate > r.stripe, "at $5K a month the $299 fee makes Scale pricier than Stripe");
  assert.ok(curve.at(-1).rate < r.adyen, "at $2M a month Scale beats even Adyen");
  assert.ok(curve.every((p) => p.profit > 0), "a monthly fee is revenue, so Scale never loses money");
});
