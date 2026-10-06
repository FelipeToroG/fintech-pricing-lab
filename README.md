# FairSwipe

A static pricing lab for **FairSwipe**, a fictional card-payments startup. It answers two questions for every pricing plan:

1. Does the plan make money after interchange, network fees and processing costs?
2. Is it cheaper for the merchant than Stripe, Square, PayPal and Adyen?

Every competitor and interchange figure is taken from a published source, with the link and capture date in the data file.

**Live site:** https://felipetorog.github.io/fintech-pricing-lab/

## Pages

| Page | What it does |
|---|---|
| `index.html` | Product overview, a line-by-line receipt showing where an $80 card fee goes, and the plan lineup |
| `manageplans.html` | Create, view, edit and delete pricing plans with validation and a live economics preview |
| `analytics.html` | Merchant and cost-structure sliders, KPI tiles, a recommended-plan finder and two Chart.js charts |
| `aboutus.html` | Developer profile and how the site was built |

## Data

| File | Contents |
|---|---|
| `data/providers.json` | Published US fees for Stripe, Square, PayPal and Adyen, plus Visa interchange benchmarks. One row per fee component, each with a source and capture date |
| `data/startup.json` | FairSwipe's plans, sample merchants and cost assumptions. These are scenario inputs, kept apart from cited facts on purpose |
| `data/SCHEMA.md` | Field reference and the pricing formulas |

Sources: [Visa USA interchange fees (effective April 18, 2026)](https://usa.visa.com/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf), [Stripe](https://stripe.com/pricing), [Square](https://squareup.com/us/en/pricing), [PayPal](https://www.paypal.com/us/business/paypal-business-fees), [Adyen](https://www.adyen.com/pricing). Captured September 28, 2026.

## How it is built

- **HTML, CSS and JavaScript with no framework and no build step.** The site runs from the repository root on GitHub Pages.
- **`js/model.js`** holds all pricing math as pure functions. The receipt, table, KPIs and charts all call it, so no number is calculated twice.
- **`css/main.css`** defines colors, type and spacing once as design tokens. Dark mode is a second set of token values.
- **Chart.js** loads only on the analytics page.
- **Session storage** keeps demo plan edits for the current browser tab. Nothing is sent to a server.

```
index.html  manageplans.html  analytics.html  aboutus.html
css/main.css
js/common.js     shared: theme, menu, motion, data loading, session store
js/model.js      pricing model (pure functions)
js/home.js  js/manage.js  js/analytics.js  js/about.js
data/            cited fees and scenario inputs
tests/           model tests (Node built-in test runner)
tools/           page generator for the shared header and footer
```

## Run locally

The pages load JSON with `fetch`, so open them through a local server, not by double-clicking:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

VS Code Live Server works too.

## Tests

```bash
npm test     # or: node --test tests/model.test.mjs
```

The tests check interchange, plan prices, competitor prices and the plan finder against hand-calculated values. No packages to install.

## Editing the shared layout

The nav, footer and `<head>` are generated from one template so the four pages never drift apart. After editing `tools/build_pages.py`, run:

```bash
python3 tools/build_pages.py
```

## Limitations

- Interchange uses the lowest Visa consumer credit tiers and the regulated debit rate. Real costs are usually higher.
- Card-network assessment fees and FairSwipe's processing cost are adjustable assumptions.
- Competitor prices are standard published rates. Negotiated pricing and Adyen's unpublished minimum invoice are excluded.

## License

Code is released under the [MIT License](LICENSE). Fee figures in `data/providers.json` are published rates from the cited providers and remain theirs.

---

Built by [Felipe Toro](https://github.com/FelipeToroG) for ISM 6225 Application Development for Analytics, University of South Florida, Fall 2026. FairSwipe is a fictional company.
