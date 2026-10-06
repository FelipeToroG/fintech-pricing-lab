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

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const providers = load("providers.json");
const startup = load("startup.json");
const A = startup.assumptions;
const plan = (id) => startup.plans.find((p) => p.id === id);
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: got ${actual}, expected ${expected}`);

const ONLINE = { ticket: 80, channel: "online", debitShare: 40, volume: 150000 };
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
  // price = interchange 1.0712 + network 0.104 + markup 0.50 + 49 / 1875 sales
  close(e.price, 1.0712 + 0.104 + 0.5 + 49 / 1875, "growth price");
  close(e.margin, 0.5 + 49 / 1875 - 0.04, "growth margin = markup + fee share - processing cost");
  close(e.monthlyProfit, e.margin * 1875, "monthly profit");
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

test("finder picks the most profitable plan that undercuts the cheapest rival", () => {
  const results = startup.plans.map((p) => planEconomics(providers, A, p, ONLINE));
  const { best, cheapest, undercuts } = recommend(results, rivalPrices(providers, A, ONLINE));
  assert.equal(cheapest.id, "adyen");
  assert.equal(undercuts, true);
  assert.equal(best.plan.id, "growth");
});

test("finder admits when no plan can beat the market", () => {
  // Coffee shop: card costs alone (about $0.27) exceed Stripe's in-person price ($0.266)
  const results = startup.plans.map((p) => planEconomics(providers, A, p, COFFEE));
  const { undercuts, cheapest, best } = recommend(results, rivalPrices(providers, A, COFFEE));
  assert.equal(undercuts, false);
  assert.equal(cheapest.id, "stripe");
  // Falls back to the most competitive profitable plan, not the most profitable one
  assert.equal(best.plan.id, "micro");
});

test("subscription plans are expensive for small merchants and cheapest for large ones", () => {
  const curve = volumeCurve(providers, A, plan("scale"), ONLINE);
  const r = Object.fromEntries(rivalPrices(providers, A, ONLINE).map((x) => [x.id, x.effectiveRate]));
  assert.equal(curve.length, VOLUME_STEPS.length);
  assert.ok(curve[0].rate > r.stripe, "at $5K a month the $299 fee makes Scale pricier than Stripe");
  assert.ok(curve.at(-1).rate < r.adyen, "at $2M a month Scale beats even Adyen");
  assert.ok(curve.every((p) => p.profit > 0), "a monthly fee is revenue, so Scale never loses money");
});
