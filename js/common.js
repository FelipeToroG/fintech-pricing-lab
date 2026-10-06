// =====================================================================
// common.js: behavior shared by every page.
//   - theme toggle (light default, choice kept for this tab)
//   - mobile menu
//   - scroll reveal, receipt "printing", number count-up
//   - toast messages
//   - data loading and the session-scoped plan store (decision 5B)
// Loaded as an ES module, so it is deferred automatically and never blocks first paint.
// =====================================================================

// ---------- Safe session storage ----------
// sessionStorage can throw (private mode, blocked site data, some embedded previews).
// Every read and write goes through these wrappers so a storage failure degrades to
// "edits are not remembered" instead of breaking the page.
const KEYS = { theme: "fairswipe.theme", plans: "fairswipe.plans" };

function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, value); return true; } catch { return false; }
}
function removeSession(key) {
  try { sessionStorage.removeItem(key); } catch { /* nothing to clean up */ }
}

// ---------- Theme ----------
// Light is the default by design decision. The toggle choice lives in sessionStorage so it
// follows the visitor across pages in the same tab, then resets for a new visit.
export function initTheme() {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  const apply = (mode) => {
    root.dataset.theme = mode;
    if (btn) {
      btn.textContent = mode === "dark" ? "Light" : "Dark";
      btn.setAttribute("aria-pressed", String(mode === "dark"));
      btn.setAttribute("aria-label", `Switch to ${mode === "dark" ? "light" : "dark"} mode`);
    }
    // Charts read colors from CSS tokens, so pages listen for this event and repaint.
    document.dispatchEvent(new CustomEvent("themechange", { detail: mode }));
  };
  apply(readSession(KEYS.theme) === "dark" ? "dark" : "light");
  btn?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    writeSession(KEYS.theme, next);
    apply(next);
  });
}

// ---------- Mobile menu ----------
export function initMenu() {
  const btn = document.getElementById("menuToggle");
  const links = document.getElementById("navLinks");
  if (!btn || !links) return;
  btn.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Close" : "Menu";
  });
}

// ---------- Motion ----------
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// One IntersectionObserver drives every entrance effect. Each element animates once;
// replaying on every scroll reads as gimmicky on a finance site.
export function initReveal() {
  const targets = document.querySelectorAll(".reveal, .receipt");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in", "printed"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      if (e.target.classList.contains("receipt")) e.target.classList.add("printed");
      e.target.querySelectorAll?.(".receipt").forEach((r) => r.classList.add("printed"));
      io.unobserve(e.target);
    });
  }, { threshold: 0.18 });
  targets.forEach((el) => io.observe(el));
}

// Tweens a number in an element. `format` turns the raw number into display text.
// Gotcha: the tween must start from the previously shown value, not zero, or every
// slider move would flash the KPI back to $0 before climbing.
export function tweenNumber(el, to, format, duration = 650) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(to);
  if (reducedMotion() || !Number.isFinite(from) || !Number.isFinite(to)) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);              // ease-out cubic
    el.textContent = format(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Toast ----------
let toastTimer;
export function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");                 // screen readers announce it politely
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Formatting ----------
// Every number that reaches the screen goes through one of these, so floating point
// artifacts like 0.30000000000000004 never leak into the UI.
export const fmt = {
  usd: (v, d = 2) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }),
  usd0: (v) => (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"),
  pct: (v, d = 2) => v.toFixed(d) + "%",
  cents: (v) => Math.round(v * 100) + "¢",
  compact: (v) => "$" + (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M" : Math.round(v / 1e3) + "K"),
};

// Human-readable price for a plan, used on cards, table rows and dialogs
export function planPriceText(p) {
  const fixed = p.fixed_usd ? ` + ${fmt.cents(p.fixed_usd)}` : "";
  return p.type === "ic_plus" ? `IC + ${fmt.pct(p.rate_pct)}${fixed}` : `${fmt.pct(p.rate_pct)}${fixed}`;
}

// ---------- Data ----------
// Both JSON files are fetched in parallel. fetch() needs a web server: GitHub Pages and
// VS Code Live Server work, double-clicking the HTML file (file://) does not.
let cache;
export async function loadData() {
  if (cache) return cache;
  const get = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} returned ${r.status}`);
    return r.json();
  });
  const [providers, startup] = await Promise.all([get("data/providers.json"), get("data/startup.json")]);
  cache = { providers, startup };
  return cache;
}

// Plans come from this tab's session if the visitor edited them, otherwise from startup.json.
// A deep copy is returned so callers can never mutate the cached defaults by accident.
export function getPlans(startup) {
  const saved = readSession(KEYS.plans);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* corrupted entry: fall through to defaults */ }
  }
  return structuredClone(startup.plans);
}
export const savePlans = (plans) => writeSession(KEYS.plans, JSON.stringify(plans));
export const resetPlans = () => removeSession(KEYS.plans);
export const plansEdited = () => readSession(KEYS.plans) !== null;

// The one sample sale shown on Home and Manage plans. It is a merchant profile (named by
// startup.json -> reference_merchant_id), so it always matches that profile on Analytics.
export function referenceSale(startup) {
  const m = startup.merchants.find((x) => x.id === startup.reference_merchant_id);
  if (!m) throw new Error(`startup.json reference_merchant_id "${startup.reference_merchant_id}" matches no merchant`);
  return { ticket: m.avg_ticket_usd, channel: m.channel, debitShare: m.debit_share_pct, volume: m.monthly_volume_usd };
}
export const channelName = (c) => (c === "in_person" ? "in-person" : "online");

// Fills every [data-ref] span in the page copy from the reference sale, so labels like
// "$80 online sale" can never disagree with the numbers next to them.
export function fillReferenceText(ref) {
  const text = {
    ticket: fmt.usd(ref.ticket, 0),
    channel: channelName(ref.channel),
    mix: `${100 - ref.debitShare}% credit, ${ref.debitShare}% debit`,
    volume: fmt.compact(ref.volume),
  };
  document.querySelectorAll("[data-ref]").forEach((el) => { el.textContent = text[el.dataset.ref] ?? el.textContent; });
}

// Shows a readable message if data fails to load (most often: opened via file://)
export function showLoadError(container, err) {
  console.error(err);
  container.innerHTML = `<div class="notice">The pricing data could not load. If you opened this file directly, run it from a local web server such as VS Code Live Server.</div>`;
}

// ---------- Boot ----------
// Runs on every page. Page modules import what they need and call their own init.
export function boot() {
  initTheme();
  initMenu();
  initReveal();
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
}
