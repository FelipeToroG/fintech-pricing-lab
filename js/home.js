// =====================================================================
// home.js: fills the stat strip, the "where your fee goes" receipt and the
// plan cards from the data files. Nothing on the home page is hard-coded,
// so an edited plan on Manage plans shows up here in the same tab.
// =====================================================================
import { boot, loadData, getPlans, plansEdited, fmt, planPriceText, tweenNumber, showLoadError, referenceSale, channelName, fillReferenceText } from "./common.js";
import { planEconomics, rivalPrices, interchange } from "./model.js";

boot();

// The reference sale is the merchant profile named in startup.json, so Home and Manage plans
// always show the same numbers for the same sale, matching that profile on Analytics.
let REFERENCE;

// Escapes plan names and targets before they go into innerHTML, because visitors can type them.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function init() {
  let data;
  try { data = await loadData(); }
  catch (err) { showLoadError(document.getElementById("planCards"), err); return; }

  const { providers, startup } = data;
  const A = startup.assumptions;
  REFERENCE = referenceSale(startup);
  fillReferenceText(REFERENCE);
  const plans = getPlans(startup);
  const rivals = rivalPrices(providers, A, REFERENCE);
  const stripe = rivals.find((r) => r.id === "stripe");

  // The receipt follows the featured plan; if the visitor deleted it, fall back to the first plan.
  const hero = plans.find((p) => p.featured) ?? plans[0];
  const heroEcon = hero ? planEconomics(providers, A, hero, REFERENCE) : null;

  // ---- Stat strip ----
  // Computed from interchange directly (not from a plan) so it still works if every plan is deleted.
  const cardCosts = interchange(providers, A, REFERENCE) + REFERENCE.ticket * A.network_fee_pct / 100;
  const passthrough = (cardCosts / stripe.price) * 100;
  const statEls = Object.fromEntries([...document.querySelectorAll("[data-stat]")].map((el) => [el.dataset.stat, el]));
  tweenNumber(statEls.passthrough, passthrough, (v) => Math.round(v) + "%", 1200);
  if (heroEcon) {
    tweenNumber(statEls.saving, stripe.price - heroEcon.price, (v) => fmt.usd(v), 1200);
    // The label names the plan the number is computed from, so renaming or deleting plans can't make it lie
    document.getElementById("savingPlan").textContent = hero.name;
  }
  else statEls.saving.textContent = "n/a";
  statEls.rivals.textContent = String(rivals.length);

  // ---- Receipt ----
  // Footnote links point at the cited source (interchange) and the assumption (Analytics page).
  const rows = document.getElementById("receiptRows");
  if (!heroEcon) rows.innerHTML = `<div class="r-row"><span>No plans to show. Reset plans on Manage plans.</span><span></span></div>`;
  if (heroEcon) {
    document.querySelector(".r-sub").textContent = `${channelName(REFERENCE.channel).toUpperCase()} SALE \u00B7 ${100 - REFERENCE.debitShare}% CREDIT / ${REFERENCE.debitShare}% DEBIT \u00B7 ${hero.name.toUpperCase()} PLAN`;
    const line = (label, value, cls = "") => `<div class="r-row ${cls}"><span>${label}</span><span>${value}</span></div>`;
    rows.innerHTML =
      line("Sale amount", fmt.usd(REFERENCE.ticket)) +
      line(`Interchange <sup><a href="https://usa.visa.com/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf" target="_blank" rel="noopener" aria-label="Source: Visa interchange schedule">[1]</a></sup>`, fmt.usd(heroEcon.ic)) +
      line(`Network fee <sup><a href="analytics.html" aria-label="Assumption, adjustable on the analytics page">[2]</a></sup>`, fmt.usd(heroEcon.network)) +
      line(`Processing cost <sup><a href="analytics.html" aria-label="Assumption, adjustable on the analytics page">[2]</a></sup>`, fmt.usd(heroEcon.cost)) +
      line("FairSwipe margin", fmt.usd(heroEcon.margin), heroEcon.margin >= 0 ? "r-margin" : "r-margin neg-text") +
      line("Merchant pays", fmt.usd(heroEcon.price), "r-total") +
      line("Stripe would charge", fmt.usd(stripe.price), "r-rival");
  }

  // ---- Plan cards ----
  const cards = document.getElementById("planCards");
  cards.innerHTML = plans.map((p) => {
    const e = planEconomics(providers, A, p, REFERENCE);
    return `<article class="card plan${p.featured ? " featured" : ""}">
      <div class="label">${esc(p.target) || "&nbsp;"}</div>
      <h3>${esc(p.name)}</h3>
      <div class="price">${planPriceText(p)}</div>
      <div class="fee">${p.monthly_fee_usd ? fmt.usd0(p.monthly_fee_usd) + " per month" : "No monthly fee"}</div>
      <ul>
        <li><span>Per ${fmt.usd(REFERENCE.ticket, 0)} sale</span><span>${fmt.usd(e.price)}</span></li>
        <li><span>Effective rate</span><span>${fmt.pct(e.effectiveRate)}</span></li>
        <li><span>${p.type === "ic_plus" ? "Card costs" : "Pricing"}</span><span>${p.type === "ic_plus" ? "At cost" : "One flat rate"}</span></li>
      </ul>
    </article>`;
  }).join("");
  document.getElementById("editedNote").hidden = !plansEdited();
}

init();
