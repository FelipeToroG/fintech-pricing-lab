# Data schema

Two files feed every page. `providers.json` holds **published, cited facts**. `startup.json` holds **FairSwipe's scenario inputs**, which are decisions and assumptions, not facts. Keeping them in separate files is deliberate: nothing invented can be mistaken for a cited number.

# providers.json (v1.1.0)

JSON cannot carry comments, so this file is the field reference.

## Design rules

- **One row per fee component.** A provider's price is a *set* of rows, not one number. Adyen's Visa price is two rows (a $0.13 processing fee plus a 0.60% markup over interchange), so the calculator sums rows instead of special-casing providers.
- **Published numbers only.** Every row points to a `source_id` with a URL and a capture date. If a provider does not publish a number (Adyen's minimum invoice), the row says so in `notes` and the value stays out.
- **Percent is stored as a percent** (`2.9` means 2.9%, not 0.029). Divide by 100 exactly once, in the calculator.
- **Null means "does not apply"** and is different from zero. `fixed_usd: 0.0` means the fee has no fixed part. `rate_pct: null` means the row is a flat fee.

## Top level

| Field | Meaning |
|---|---|
| `schema_version` | Bump the minor version for new optional fields and the major version for renames or removals |
| `currency`, `market` | All values are USD, US-domestic pricing |
| `captured_date` | Date the whole snapshot was taken (ISO 8601) |
| `providers[]` | `id`, `name`, `pricing_model`, `website` |
| `sources[]` | `id`, `title`, `url`, `captured_date` |
| `interchange_benchmarks[]` | Card-network wholesale cost used to price interchange-plus providers |
| `fees[]` | The normalized fee rows (below) |

## fees[]

| Field | Values | Meaning |
|---|---|---|
| `id` | string | Unique, stable key. The CRUD page uses it for update and delete |
| `provider_id` | `providers[].id` | Owner of the fee |
| `plan` | `Standard`, `Free`, `Plus`, `Premium` | Pricing plan. `Standard` when the provider has one plan |
| `channel` | `in_person`, `online`, `keyed`, `all` | Where the payment is taken |
| `payment_method` | `card`, `visa`, `mastercard`, `amex`, `discover`, `ach`, `paypal_wallet`, `venmo`, `pay_later` | What the customer pays with |
| `fee_component` | `processing`, `markup`, `surcharge`, `subscription`, `dispute` | Role of the fee. `markup` exists only on interchange-plus rows |
| `value_metric` | `per_transaction`, `per_month`, `per_dispute` | The unit the fee is charged on |
| `meter_type` | `percent_plus_fixed`, `interchange_plus`, `percent_capped`, `flat` | How to compute the fee (see below) |
| `rate_pct` | number or null | Percentage component |
| `fixed_usd` | number or null | Fixed component in dollars |
| `cap_usd`, `min_usd` | number or null | Per-transaction ceiling and floor (ACH rows) |
| `tier_min_volume_usd`, `tier_max_volume_usd` | number or null | Monthly processing volume band. Lower bound inclusive, upper bound exclusive |
| `adds_to_channel` | channel or null | Row is an adder stacked on another channel's rate (Stripe keyed = online + 0.5%) |
| `condition` | `international_card`, `currency_conversion`, or null | Row applies only when this condition is true |
| `source_id` | `sources[].id` | Citation |
| `captured_date` | ISO date | When this specific number was read from the source |
| `notes` | string or null | Human-readable caveat shown in the UI |

## meter_type math (per transaction of amount `t`)

- `percent_plus_fixed`: `t * rate_pct / 100 + fixed_usd`
- `interchange_plus`: `t * (ic.rate_pct + rate_pct) / 100 + ic.fixed_usd + fixed_usd`, where `ic` is the matching `interchange_benchmarks` row
- `percent_capped`: `min(max(t * rate_pct / 100 + fixed_usd, min_usd), cap_usd)`, skipping null bounds
- `flat`: `fixed_usd`. For `per_month` rows, divide by monthly transaction count to get a per-transaction share

## Known limitations (stated on the analytics page)

- Interchange benchmarks use the cheapest Visa consumer credit tier. Rewards and premium cards cost more, so interchange-plus estimates are a floor.
- Card-network assessment fees are not published in one citable place. The site models them as an adjustable assumption (`startup.json`, `network_fee_pct`).
- Adyen's minimum invoice is not published and is excluded. It matters most for small merchants.

- Regulated debit rates apply to large issuing banks only. Debit cards from smaller banks carry higher interchange.

# startup.json (v1.0.0)

| Field | Meaning |
|---|---|
| `assumptions.processing_cost_usd` | FairSwipe's own cost per transaction (scenario) |
| `assumptions.network_fee_pct` | Card-brand assessment fee as a percent of the sale (scenario) |
| `assumptions.debit_fraud_adjustment_usd` | Added to regulated debit interchange (from the Visa schedule) |
| `plans[]` | `id`, `name`, `type` (`flat` or `ic_plus`), `rate_pct`, `fixed_usd`, `monthly_fee_usd`, `target`, `featured` |
| `merchants[]` | `id`, `name`, `channel` (`in_person` or `online`), `avg_ticket_usd`, `monthly_volume_usd`, `debit_share_pct` |

## Pricing model (js/model.js)

Per transaction of amount `t`, debit share `d`, channel `c`:

- `interchange = (1 - d) * (t * credit_rate_c + credit_fixed_c) + d * (t * 0.05% + $0.21 + fraud_adj)`
- `network = t * network_fee_pct`
- Flat plan price: `t * rate + fixed + monthly_fee / transactions`
- Interchange-plus plan price: `interchange + network + t * rate + fixed + monthly_fee / transactions`
- `FairSwipe margin = price - interchange - network - processing_cost`
- Adyen price: `$0.13 + interchange + network + t * 0.60%` (Visa and Mastercard)
- Stripe, Square (Free plan) and PayPal prices use their published flat rate for the merchant's channel
