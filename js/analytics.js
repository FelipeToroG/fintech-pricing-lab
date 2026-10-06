// =====================================================================
// analytics.js: scenario controls, KPI tiles, the recommended-plan finder
// and both charts. All math comes from model.js; this file only reads inputs,
// calls the model and draws the results.
//
// Rendering strategy: charts are created once and then updated in place on every
// slider move, so Chart.js animates between states instead of flashing a redraw.
// They are rebuilt only when the theme changes (colors come from CSS tokens).
// =====================================================================
import { boot, loadData, getPlans, fmt, tweenNumber, showLoadError } from "./common.js";
import { planEconomics, rivalPrices, recommend, volumeCurve, VOLUME_STEPS } from "./model.js";

boot();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Monthly-sales slider positions. A plain linear slider from $5K to $2M would make every
// small-business value land in the first few pixels, so the slider walks this list instead.
const VOLUMES = [5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 200000,
  250000, 300000, 400000, 500000, 750000, 1000000, 1500000, 2000000];
const nearestVolumeIndex = (v) => VOLUMES.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(VOLUMES[best] - v) ? i : best), 0);

let providers, startup, plans;
let breakdownChart, curveChart;

// ---------- Scenario state ----------
function readScenario() {
  const merchant = startup.merchants.find((m) => m.id === $("merchant").value);
  return {
    channel: merchant.channel,
    ticket: Number($("ticket").value),
    debitShare: Number($("debit").value),
    volume: VOLUMES[Number($("volume").value)],
  };
}
function readAssumptions() {
  // Only the two slider-driven values change; the fraud adjustment stays at its cited value.
  return { ...startup.assumptions, processing_cost_usd: Number($("procCost").value), network_fee_pct: Number($("netFee").value) };
}

// Loading a merchant profile resets the merchant sliders to that profile's defaults.
function applyMerchant(id) {
  const m = startup.merchants.find((x) => x.id === id);
  $("ticket").value = m.avg_ticket_usd;
  $("debit").value = m.debit_share_pct;
  $("volume").value = nearestVolumeIndex(m.monthly_volume_usd);
}
function resetScenario() {
  $("merchant").value = startup.merchants[1].id;      // online store is the most representative default
  applyMerchant($("merchant").value);
  $("procCost").value = startup.assumptions.processing_cost_usd;
  $("netFee").value = startup.assumptions.network_fee_pct;
}

function syncOutputs(s, a) {
  $("ticketOut").textContent = fmt.usd(s.ticket, 0);
  $("debitOut").textContent = `${s.debitShare}%`;
  $("volumeOut").textContent = fmt.compact(s.volume);
  $("procOut").textContent = fmt.usd(a.processing_cost_usd);
  $("netOut").textContent = fmt.pct(a.network_fee_pct);
}

// ---------- Colors ----------
// Color follows the plan, never its position: each default plan owns a fixed slot by id,
// so deleting Micro-ticket does not repaint Growth. Plans added by the visitor have no slot;
// rather than inventing new hues, they use the neutral tone with a dashed line as the cue.
let slotById = {};
const slot = (p) => slotById[p.id];
const planColor = (p) => (slot(p) ? css(`--c-plan-${slot(p)}`) : css("--c-rival"));
const planDash = (p) => (slot(p) ? [] : [6, 4]);

// ---------- Chart plugins ----------
// Direct labels: the total price at the end of each bar and the plan name at the end of
// each line. Identity is then never carried by color alone.
const barTotals = {
  id: "barTotals",
  afterDatasetsDraw(chart) {
    const { ctx, scales: { x, y } } = chart;
    ctx.save();
    ctx.font = "500 12px 'IBM Plex Mono', monospace";
    ctx.fillStyle = css("--text-muted");
    ctx.textBaseline = "middle";
    chart.data.labels.forEach((_, i) => {
      const total = chart.data.datasets.reduce((sum, ds) => sum + Math.max(ds.data[i] ?? 0, 0), 0);
      if (!total) return;
      ctx.fillText(fmt.usd(total), x.getPixelForValue(total) + 8, y.getPixelForValue(i));
    });
    ctx.restore();
  },
};
const lineEndLabels = {
  id: "lineEndLabels",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    // Collect each visible line's end point, then push labels apart vertically so two lines
    // ending near the same value (for example Growth and Adyen) never print on top of each other.
    const labels = chart.data.datasets.map((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      const last = meta.data[meta.data.length - 1];
      if (!last || meta.hidden) return null;
      return { text: ds.label, x: last.x + 8, y: Math.min(Math.max(last.y, chartArea.top), chartArea.bottom) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    const GAP = 14;
    for (let i = 1; i < labels.length; i++) {
      if (labels[i].y - labels[i - 1].y < GAP) labels[i].y = labels[i - 1].y + GAP;
    }
    ctx.save();
    ctx.font = "500 12px 'Jost', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = css("--text");
    labels.forEach((l) => ctx.fillText(l.text, l.x, l.y));
    ctx.restore();
  },
};

// Shared Chart.js styling read from tokens: recessive grid, muted ticks, mono numbers.
function baseOptions() {
  const muted = css("--text-muted"), rule = css("--rule");
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },           // HTML legend above each chart instead, styled with text tokens
      tooltip: {
        backgroundColor: css("--heading"), titleColor: css("--page"), bodyColor: css("--page"), footerColor: css("--page"),
        titleFont: { family: "Jost", weight: "600" }, bodyFont: { family: "IBM Plex Mono" }, footerFont: { family: "IBM Plex Mono", weight: "500" },
        padding: 12, cornerRadius: 6, boxPadding: 4,
      },
    },
    scales: {
      x: { grid: { color: rule }, border: { display: false }, ticks: { color: muted, font: { family: "IBM Plex Mono", size: 11 } } },
      y: { grid: { color: rule }, border: { display: false }, ticks: { color: muted, font: { family: "Jost", size: 13 } } },
    },
  };
}

// ---------- Chart 1: who gets paid on each sale ----------
function breakdownData(results, rivals) {
  const n = results.length;
  const pad = (arr) => [...arr, ...rivals.map(() => null)];   // rival rows have no breakdown
  const surface = css("--surface");
  const seg = (label, data, color) => ({
    label, data, backgroundColor: color, borderColor: surface, borderWidth: 2,  // 2px surface gap between segments
    borderRadius: 4, borderSkipped: false, barPercentage: 0.72, categoryPercentage: 0.9,
  });
  return {
    labels: [...results.map((r) => r.plan.name), ...rivals.map((r) => r.name)],
    datasets: [
      seg("Interchange", pad(results.map((r) => r.ic)), css("--c-interchange")),
      seg("Network fee", pad(results.map((r) => r.network)), css("--c-network")),
      seg("Processing cost", pad(results.map((r) => r.cost)), css("--c-cost")),
      // Margin bars switch to the loss color when a plan loses money on the sale
      seg("FairSwipe margin", pad(results.map((r) => r.margin)), [...results.map((r) => (r.margin >= 0 ? css("--c-margin") : css("--c-loss"))), ...rivals.map(() => "transparent")]),
      seg("Competitor price", [...Array(n).fill(null), ...rivals.map((r) => r.price)], css("--c-rival")),
    ],
  };
}

function buildBreakdown(results, rivals) {
  const opts = baseOptions();
  opts.indexAxis = "y";
  opts.layout = { padding: { right: 64 } };            // room for the direct total labels
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
  opts.scales.y.grid.display = false;
  opts.scales.x.ticks.callback = (v) => fmt.usd(v);
  opts.plugins.tooltip.callbacks = {
    label: (c) => (c.raw == null ? null : `${c.dataset.label}: ${fmt.usd(c.raw)}`),
    footer: (items) => {
      const total = items.reduce((s, it) => s + Math.max(it.raw ?? 0, 0), 0);
      return `Merchant pays: ${fmt.usd(total)}`;
    },
  };
  opts.plugins.tooltip.mode = "index";
  opts.plugins.tooltip.filter = (it) => it.raw != null;
  breakdownChart = new Chart($("breakdownChart"), { type: "bar", data: breakdownData(results, rivals), options: opts, plugins: [barTotals] });
}

// ---------- Chart 2: merchant's effective rate as sales grow (decision 3C) ----------
// Plans are solid lines; Stripe (the market benchmark) and the cheapest other rival are
// dashed neutral lines. Where a plan line drops below a dashed line, that plan becomes the
// better deal for the merchant. FairSwipe's monthly profit rides along in the tooltip.
function rivalRefs(rivals) {
  const stripe = rivals.find((r) => r.id === "stripe");
  const others = rivals.filter((r) => r.id !== "stripe");
  const cheapestOther = others.reduce((a, b) => (b.price < a.price ? b : a));
  return [stripe, cheapestOther];
}
function curveData(s, a, rivals) {
  const planSets = plans.map((p) => {
    const curve = volumeCurve(providers, a, p, s);
    return {
      label: p.name,
      data: curve.map((c) => c.rate),
      profits: curve.map((c) => c.profit),          // custom field read by the tooltip and table
      borderColor: planColor(p), backgroundColor: planColor(p), borderDash: planDash(p),
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 6,
      pointBorderColor: css("--surface"), pointBorderWidth: 2,   // surface ring keeps overlapping points readable
      tension: 0.25,
    };
  });
  const rivalSets = rivalRefs(rivals).map((r, i) => ({
    label: r.name,
    data: VOLUME_STEPS.map(() => r.effectiveRate),
    isRival: true,
    borderColor: css("--c-rival"), backgroundColor: css("--c-rival"),
    borderDash: i === 0 ? [6, 4] : [2, 3], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0,
  }));
  return { labels: VOLUME_STEPS.map(fmt.compact), datasets: [...planSets, ...rivalSets] };
}

function buildCurve(s, a, rivals) {
  const opts = baseOptions();
  opts.layout = { padding: { right: 96 } };            // room for the names at line ends
  opts.interaction = { mode: "index", intersect: false };   // crosshair-style tooltip across all lines
  opts.scales.y.ticks.font = { family: "IBM Plex Mono", size: 11 };
  opts.scales.y.ticks.callback = (v) => fmt.pct(v, 1);
  opts.scales.y.suggestedMin = 0;
  // Cap the axis so a $299 plan at $5K (rate near 8%) does not flatten every other line
  opts.scales.y.max = 6;
  opts.scales.x.grid.display = false;
  opts.scales.x.title = { display: true, text: "Merchant monthly sales", color: css("--text-muted"), font: { family: "Jost", size: 12 } };
  opts.scales.y.title = { display: true, text: "Merchant's effective rate", color: css("--text-muted"), font: { family: "Jost", size: 12 } };
  opts.plugins.tooltip.callbacks = {
    title: (items) => `${items[0].label} monthly sales`,
    label: (c) => c.dataset.isRival
      ? `${c.dataset.label}: ${fmt.pct(c.raw)}`
      : `${c.dataset.label}: ${fmt.pct(c.raw)}, FairSwipe earns ${fmt.usd0(c.dataset.profits[c.dataIndex])}/mo`,
  };
  curveChart = new Chart($("curveChart"), { type: "line", data: curveData(s, a, rivals), options: opts, plugins: [lineEndLabels] });
}

// HTML legends use text tokens for the words and a small swatch for identity.
function renderLegends() {
  const sw = (color, label, dashed = false) => `<span><i style="background:${color}${dashed ? ";outline:1px dashed var(--text-muted)" : ""}"></i>${esc(label)}</span>`;
  $("breakdownLegend").innerHTML =
    sw(css("--c-interchange"), "Interchange") + sw(css("--c-network"), "Network fee") + sw(css("--c-cost"), "Processing cost") +
    sw(css("--c-margin"), "FairSwipe margin") + sw(css("--c-loss"), "Loss") + sw(css("--c-rival"), "Competitor price");
  $("curveLegend").innerHTML = plans.map((p) => sw(planColor(p), p.name, !slot(p))).join("") + sw(css("--c-rival"), "Competitors (dashed)", true);
}

// ---------- Tables (accessible view of both charts) ----------
function renderTables(results, rivals, s, a) {
  $("breakdownTable").innerHTML = `
    <thead><tr><th scope="col">Option</th><th scope="col" class="r">Interchange</th><th scope="col" class="r">Network</th><th scope="col" class="r">Processing</th><th scope="col" class="r">FairSwipe keeps</th><th scope="col" class="r">Merchant pays</th><th scope="col" class="r">Rate</th></tr></thead>
    <tbody>
      ${results.map((r) => `<tr><td>${esc(r.plan.name)}</td><td class="num r">${fmt.usd(r.ic)}</td><td class="num r">${fmt.usd(r.network)}</td><td class="num r">${fmt.usd(r.cost)}</td><td class="num r ${r.margin < 0 ? "neg-text" : ""}">${fmt.usd(r.margin)}</td><td class="num r">${fmt.usd(r.price)}</td><td class="num r">${fmt.pct(r.effectiveRate)}</td></tr>`).join("")}
      ${rivals.map((r) => `<tr><td>${r.name} <span class="muted small">(${r.basis})</span></td><td class="num r muted" colspan="4">Published rate</td><td class="num r">${fmt.usd(r.price)}</td><td class="num r">${fmt.pct(r.effectiveRate)}</td></tr>`).join("")}
    </tbody>`;
  const curves = plans.map((p) => volumeCurve(providers, a, p, s));
  const refs = rivalRefs(rivals);
  $("curveTable").innerHTML = `
    <thead><tr><th scope="col">Monthly sales</th>${plans.map((p) => `<th scope="col" class="r">${esc(p.name)}<br><span class="muted">rate / FairSwipe profit</span></th>`).join("")}${refs.map((r) => `<th scope="col" class="r">${r.name}</th>`).join("")}</tr></thead>
    <tbody>${VOLUME_STEPS.map((v, i) => `<tr><td class="num">${fmt.compact(v)}</td>${curves.map((c) => `<td class="num r">${fmt.pct(c[i].rate)} / ${fmt.usd0(c[i].profit)}</td>`).join("")}${refs.map((r) => `<td class="num r">${fmt.pct(r.effectiveRate)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

// ---------- KPIs and the finder ----------
function renderKpis(results, rivals, s) {
  if (!results.length) {
    $("kPlan").textContent = "No plans";
    $("finder").innerHTML = `There are no plans to evaluate. <a href="manageplans.html">Add or reset plans</a>.`;
    return;
  }
  const { best, cheapest, undercuts } = recommend(results, rivals);
  const stripe = rivals.find((r) => r.id === "stripe");
  const saveMonthly = (stripe.price - best.price) * best.txns;

  $("kPlan").textContent = best.plan.name;
  $("kPlanSub").textContent = undercuts ? `${fmt.pct(best.effectiveRate)} effective rate` : `closest to ${cheapest.name}, not cheaper`;
  tweenNumber($("kProfit"), best.monthlyProfit, fmt.usd0);
  $("kProfit").className = best.monthlyProfit >= 0 ? "pos" : "neg";
  $("kProfitSub").textContent = `on ${Math.round(best.txns).toLocaleString("en-US")} sales`;
  tweenNumber($("kMargin"), best.margin, (v) => fmt.usd(v));
  $("kMargin").className = best.margin >= 0 ? "pos" : "neg";
  $("kMarginSub").textContent = `${fmt.pct(best.marginPct)} of the sale`;
  tweenNumber($("kSave"), saveMonthly, fmt.usd0);
  $("kSave").className = saveMonthly >= 0 ? "pos" : "neg";

  const merchant = startup.merchants.find((m) => m.id === $("merchant").value).name;
  // Three decimals in the "no plan wins" case: the gap can be a fraction of a cent,
  // and rounding both sides to $0.27 would make the sentence look self-contradictory.
  const floor = results[0].ic + results[0].network + results[0].cost;
  $("finder").innerHTML = undercuts
    ? `For the ${esc(merchant)} profile, <strong>${esc(best.plan.name)}</strong> earns FairSwipe the most (${fmt.usd0(best.monthlyProfit)} a month) while charging ${fmt.usd(cheapest.price - best.price)} less per sale than ${cheapest.name}, the cheapest competitor.`
    : `For the ${esc(merchant)} profile, no FairSwipe plan undercuts <strong>${cheapest.name}</strong> (${fmt.usd(cheapest.price, 3)} per sale) without losing money: card costs alone are ${fmt.usd(floor, 3)}. The closest is <strong>${esc(best.plan.name)}</strong> at ${fmt.usd(best.price, 3)}, ${fmt.usd(best.price - cheapest.price, 3)} more per sale.`;
}

// ---------- Main update loop ----------
function update() {
  const s = readScenario();
  const a = readAssumptions();
  syncOutputs(s, a);
  const results = plans.map((p) => planEconomics(providers, a, p, s));
  const rivals = rivalPrices(providers, a, s);
  renderKpis(results, rivals, s);

  if (window.Chart) {
    if (!breakdownChart) { buildBreakdown(results, rivals); buildCurve(s, a, rivals); }
    else {
      // Replace data in place so Chart.js tweens bar lengths and line positions
      const bd = breakdownData(results, rivals);
      breakdownChart.data.labels = bd.labels;
      bd.datasets.forEach((ds, i) => Object.assign(breakdownChart.data.datasets[i], ds));
      breakdownChart.update();
      const cd = curveData(s, a, rivals);
      curveChart.data.labels = cd.labels;
      curveChart.data.datasets = cd.datasets;
      curveChart.update();
    }
  }
  renderTables(results, rivals, s, a);
}

// Theme switch: rebuild charts so every color is re-read from the new token values.
function rebuildCharts() {
  breakdownChart?.destroy(); curveChart?.destroy();
  breakdownChart = curveChart = null;
  renderLegends();
  update();
}

async function init() {
  try { ({ providers, startup } = await loadData()); }
  catch (err) { showLoadError(document.querySelector(".analytics-grid"), err); return; }
  plans = getPlans(startup);
  slotById = Object.fromEntries(startup.plans.slice(0, 4).map((p, i) => [p.id, i + 1]));

  $("merchant").innerHTML = startup.merchants.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  $("volume").max = VOLUMES.length - 1;
  resetScenario();
  renderLegends();

  // Chart.js comes from a CDN; if it is blocked, the KPIs and tables still work.
  if (!window.Chart) {
    document.querySelectorAll(".chart-box").forEach((b) => (b.innerHTML = `<p class="notice">The chart library could not load. The tables below show the same numbers.</p>`));
    document.querySelectorAll("details.table-view").forEach((d) => (d.open = true));
  }

  // input fires continuously while dragging, so the charts track the slider live.
  ["ticket", "debit", "volume", "procCost", "netFee"].forEach((id) => $(id).addEventListener("input", update));
  $("merchant").addEventListener("change", (e) => { applyMerchant(e.target.value); update(); });
  $("resetScenario").addEventListener("click", () => { resetScenario(); update(); });
  document.addEventListener("themechange", () => { if (breakdownChart) rebuildCharts(); });

  update();
}
init();
