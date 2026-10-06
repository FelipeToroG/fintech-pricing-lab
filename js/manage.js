// =====================================================================
// manage.js: the CRUD page.
//   Create: "Add plan" opens the form dialog
//   Read:   the table (with search and type filter) and the "View" dialog
//   Update: "Edit" reuses the form dialog, pre-filled
//   Delete: "Delete" asks for confirmation in its own dialog
// Changes are written to sessionStorage (decision 5B), so they reach the Home and
// Analytics pages in the same tab and vanish when the tab closes. Nothing leaves the browser.
// =====================================================================
import { boot, loadData, getPlans, savePlans, resetPlans, plansEdited, fmt, planPriceText, toast, showLoadError } from "./common.js";
import { planEconomics } from "./model.js";

boot();

// Sample sale used for the "On $80" and "FairSwipe keeps" columns. Stated in the hint under the table.
const SAMPLE = { ticket: 80, channel: "online", debitShare: 40, volume: 150000 };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const typeName = (t) => (t === "ic_plus" ? "Interchange plus" : "Flat rate");

let providers, startup, plans = [];
let editingId = null;      // null while creating, the plan id while updating
let pendingDelete = null;
let lastChanged = null;    // row to briefly highlight after a save

// ---------- Read ----------
function render() {
  const q = $("search").value.trim().toLowerCase();
  const type = $("typeFilter").value;
  // Search matches name, target and the displayed price, so typing "0.5" finds Growth.
  const visible = plans.filter((p) => {
    const hay = `${p.name} ${p.target} ${planPriceText(p)}`.toLowerCase();
    return (type === "all" || p.type === type) && (!q || hay.includes(q));
  });

  $("planRows").innerHTML = visible.map((p) => {
    const e = planEconomics(providers, startup.assumptions, p, SAMPLE);
    return `<tr data-id="${esc(p.id)}"${p.id === lastChanged ? ' class="flash"' : ""}>
      <td><strong>${esc(p.name)}</strong>${p.featured ? ' <span class="badge">Featured</span>' : ""}</td>
      <td>${typeName(p.type)}</td>
      <td class="num r">${planPriceText(p)}</td>
      <td class="num r hide-sm">${fmt.usd0(p.monthly_fee_usd)}</td>
      <td class="hide-sm muted">${esc(p.target)}</td>
      <td class="num r">${fmt.usd(e.price)}</td>
      <td class="num r ${e.margin < 0 ? "neg-text" : ""}">${fmt.usd(e.margin)}</td>
      <td><div class="actions">
        <button class="btn btn-outline btn-sm" type="button" data-act="view" aria-label="View ${esc(p.name)}">View</button>
        <button class="btn btn-outline btn-sm" type="button" data-act="edit" aria-label="Edit ${esc(p.name)}">Edit</button>
        <button class="btn btn-outline btn-sm" type="button" data-act="delete" aria-label="Delete ${esc(p.name)}">Delete</button>
      </div></td>
    </tr>`;
  }).join("");
  $("emptyState").hidden = visible.length > 0;
  lastChanged = null;
}

function persist(message) {
  savePlans(plans);
  render();
  toast(message);
}

// ---------- Create and Update share one form ----------
const form = $("planForm");
const dlg = $("planDialog");

function openForm(plan) {
  editingId = plan?.id ?? null;
  $("dlgTitle").textContent = plan ? `Edit ${plan.name}` : "Add plan";
  $("dlgEyebrow").textContent = plan ? "Update plan" : "New plan";
  $("saveBtn").textContent = plan ? "Save changes" : "Add plan";
  $("fName").value = plan?.name ?? "";
  $("fType").value = plan?.type ?? "flat";
  $("fRate").value = plan?.rate_pct ?? "";
  $("fFixed").value = plan?.fixed_usd ?? "";
  $("fMonthly").value = plan?.monthly_fee_usd ?? 0;
  $("fTarget").value = plan?.target ?? "";
  clearErrors();
  updateRateLabel();
  preview();
  dlg.showModal();
  $("fName").focus();
}

// The rate means different things per type, so the label changes with it.
function updateRateLabel() {
  $("fRateLabel").textContent = $("fType").value === "ic_plus" ? "Markup over interchange (%)" : "Rate (%)";
}

// Validation rules. Returns a map of field -> message; an empty map means valid.
// Bounds are deliberately generous but block nonsense like negative fees or a 40% rate.
function validate() {
  const errs = {};
  const name = $("fName").value.trim();
  const rate = Number($("fRate").value), fixed = Number($("fFixed").value), monthly = Number($("fMonthly").value);
  if (!name) errs.Name = "Enter a plan name.";
  else if (plans.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingId)) errs.Name = "A plan with that name already exists.";
  if ($("fRate").value === "" || !(rate >= 0 && rate <= 10)) errs.Rate = "Enter a rate from 0 to 10%.";
  if ($("fFixed").value === "" || !(fixed >= 0 && fixed <= 2)) errs.Fixed = "Enter a fixed fee from $0 to $2.";
  if ($("fMonthly").value === "" || !(monthly >= 0 && monthly <= 5000)) errs.Monthly = "Enter a monthly fee from $0 to $5,000.";
  return errs;
}
function clearErrors() {
  ["Name", "Rate", "Fixed", "Monthly"].forEach((k) => { $("e" + k).textContent = ""; $("f" + k).removeAttribute("aria-invalid"); });
}
function showErrors(errs) {
  clearErrors();
  Object.entries(errs).forEach(([k, msg]) => { $("e" + k).textContent = msg; $("f" + k).setAttribute("aria-invalid", "true"); });
  const first = Object.keys(errs)[0];
  if (first) $("f" + first).focus();
}

// Live preview of the economics while typing, so the form teaches as you edit.
function preview() {
  const draft = readForm();
  const errs = validate();
  if (errs.Rate || errs.Fixed || errs.Monthly) { $("fPreview").textContent = ""; return; }
  const e = planEconomics(providers, startup.assumptions, draft, SAMPLE);
  $("fPreview").innerHTML = `On a sample $80 online sale this plan charges <strong>${fmt.usd(e.price)}</strong> (${fmt.pct(e.effectiveRate)}) and FairSwipe keeps <strong class="${e.margin < 0 ? "neg-text" : ""}">${fmt.usd(e.margin)}</strong>.`;
}

function readForm() {
  return {
    id: editingId,
    name: $("fName").value.trim(),
    type: $("fType").value,
    rate_pct: Number($("fRate").value),
    fixed_usd: Number($("fFixed").value),
    monthly_fee_usd: Number($("fMonthly").value),
    target: $("fTarget").value.trim(),
    featured: plans.find((p) => p.id === editingId)?.featured ?? false,
  };
}

// Builds a URL-safe id from the name, adding a suffix if it collides with an existing plan.
function makeId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "plan";
  let id = base, n = 2;
  while (plans.some((p) => p.id === id)) id = `${base}-${n++}`;
  return id;
}

form.addEventListener("input", (e) => {
  if (e.target.id === "fType") updateRateLabel();
  const key = e.target.id?.slice(1);
  if ($("e" + key)) { $("e" + key).textContent = ""; e.target.removeAttribute("aria-invalid"); }  // clear an error as soon as the field is edited
  preview();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const errs = validate();
  if (Object.keys(errs).length) { showErrors(errs); return; }
  const plan = readForm();
  if (editingId) {
    plans = plans.map((p) => (p.id === editingId ? plan : p));
    lastChanged = editingId;
    dlg.close();
    persist(`${plan.name} updated`);
  } else {
    plan.id = makeId(plan.name);
    plans.push(plan);
    lastChanged = plan.id;
    dlg.close();
    persist(`${plan.name} added`);
  }
});

// ---------- Read (detail) ----------
function openView(plan) {
  const e = planEconomics(providers, startup.assumptions, plan, SAMPLE);
  $("viewTitle").textContent = plan.name;
  const rows = [
    ["Pricing type", typeName(plan.type)],
    ["Price", planPriceText(plan)],
    ["Monthly fee", fmt.usd0(plan.monthly_fee_usd)],
    ["Target merchant", plan.target || "Not set"],
    ["Sample sale", "$80 online, 40% debit"],
    ["Merchant pays", `${fmt.usd(e.price)} (${fmt.pct(e.effectiveRate)})`],
    ["Interchange", fmt.usd(e.ic)],
    ["Network fee", fmt.usd(e.network)],
    ["Processing cost", fmt.usd(e.cost)],
    ["FairSwipe keeps", fmt.usd(e.margin)],
    ["Monthly profit at $150K", fmt.usd0(e.monthlyProfit)],
  ];
  $("viewList").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  $("viewEdit").onclick = () => { $("viewDialog").close(); openForm(plan); };
  $("viewDialog").showModal();
}

// ---------- Delete ----------
function openDelete(plan) {
  pendingDelete = plan;
  $("delTitle").textContent = `Delete ${plan.name}?`;
  $("deleteDialog").showModal();
}
$("confirmDelete").addEventListener("click", () => {
  if (!pendingDelete) return;
  plans = plans.filter((p) => p.id !== pendingDelete.id);
  $("deleteDialog").close();
  persist(`${pendingDelete.name} deleted`);
  pendingDelete = null;
});

// ---------- Wiring ----------
// One delegated listener for every row button, instead of one listener per button per render.
$("planRows").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const plan = plans.find((p) => p.id === btn.closest("tr").dataset.id);
  if (!plan) return;
  ({ view: openView, edit: openForm, delete: openDelete })[btn.dataset.act](plan);
});
document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
// Clicking the dimmed backdrop closes a dialog, matching what people expect from modals.
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
$("addBtn").addEventListener("click", () => openForm(null));
$("search").addEventListener("input", render);
$("typeFilter").addEventListener("change", render);
$("resetBtn").addEventListener("click", () => {
  if (!plansEdited()) { toast("Plans are already at their defaults"); return; }
  resetPlans();
  plans = getPlans(startup);
  render();
  toast("Plans reset to defaults");
});

async function init() {
  try { ({ providers, startup } = await loadData()); }
  catch (err) { showLoadError(document.querySelector(".panel"), err); return; }
  plans = getPlans(startup);
  render();
}
init();
