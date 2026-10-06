# =====================================================================
# tools/build_pages.py
# Generates the four HTML pages from one template so the shared <head>, nav and
# footer can never drift apart between pages.
#
# Why a generator instead of JavaScript-injected headers: the pages stay plain,
# fully rendered HTML. Navigation works with JavaScript off, search engines and
# screen readers see real links, and there is no flash of a missing nav bar.
#
# The output is committed, so the site needs NO build step to run or deploy.
# Run this only when the shared layout or page content changes:
#     python3 tools/build_pages.py
# =====================================================================
import pathlib
# Writes next to the repo root regardless of where the script is run from.
OUT = str(pathlib.Path(__file__).resolve().parent.parent) + "/"

def head(title, desc, extra=""):
    return f"""<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<!-- Runs before first paint: marks JS as available (enables entrance animations) and restores
     this tab's theme choice so dark-mode visitors never see a flash of the light theme. -->
<script>document.documentElement.classList.add("js");try{{if(sessionStorage.getItem("fairswipe.theme")==="dark")document.documentElement.dataset.theme="dark"}}catch(e){{}}</script>
<!-- Fonts: only the weights used are requested; display=swap keeps text visible while they load -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Mono:wght@400;500&family=Jost:wght@400;500;600&display=swap">
<link rel="stylesheet" href="css/main.css">
{extra}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
"""

PAGES = [("index.html", "Home"), ("manageplans.html", "Manage plans"), ("analytics.html", "Analytics"), ("aboutus.html", "About")]

BRAND_MARK = """<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="7" width="26" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 13h26" stroke="currentColor" stroke-width="1.6"/><path d="M16 17.4l2 2-2 2-2-2z" fill="currentColor"/></svg>"""

def nav(current):
    cur = ' aria-current="page"'
    items = "\n".join(
        f'        <li><a href="{href}"{cur if name == current else ""}>{name}</a></li>'
        for href, name in PAGES)
    return f"""  <nav class="wrap nav" aria-label="Main">
    <a class="brand" href="index.html">{BRAND_MARK}FairSwipe</a>
    <ul class="nav-links" id="navLinks">
{items}
    </ul>
    <div class="nav-tools">
      <button class="pill-btn" id="themeToggle" type="button" aria-pressed="false">Dark</button>
      <button class="pill-btn menu-btn" id="menuToggle" type="button" aria-expanded="false" aria-controls="navLinks">Menu</button>
    </div>
  </nav>
"""

FOOTER = """<footer class="band">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="brand" href="index.html">""" + BRAND_MARK + """FairSwipe</a>
        <div class="ornament" style="justify-content:flex-start;margin:16px 0"><span></span></div>
        <p style="opacity:.8;max-width:340px">Card acceptance priced line by line, tested against what the big processors charge.</p>
      </div>
      <div>
        <h3>Explore</h3>
        <ul>
          <li><a href="index.html">Home</a></li>
          <li><a href="manageplans.html">Manage plans</a></li>
          <li><a href="analytics.html">Analytics</a></li>
          <li><a href="aboutus.html">About</a></li>
        </ul>
      </div>
      <div>
        <h3>Sources</h3>
        <ul>
          <li><a href="https://usa.visa.com/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf" target="_blank" rel="noopener">Visa USA interchange fees</a></li>
          <li><a href="https://stripe.com/pricing" target="_blank" rel="noopener">Stripe pricing</a></li>
          <li><a href="https://squareup.com/us/en/pricing" target="_blank" rel="noopener">Square pricing</a></li>
          <li><a href="https://www.paypal.com/us/business/paypal-business-fees" target="_blank" rel="noopener">PayPal merchant fees</a></li>
          <li><a href="https://www.adyen.com/pricing" target="_blank" rel="noopener">Adyen pricing</a></li>
        </ul>
      </div>
    </div>
    <p class="fine">FairSwipe is a fictional company. Its plans and cost assumptions are scenario inputs. Competitor and interchange figures come from the published sources above, captured September 28, 2026. &copy; <span id="year">2026</span> Felipe Toro.</p>
  </div>
</footer>
"""

def page(fname, title, desc, current, body, scripts, extra_head=""):
    html = head(title, desc, extra_head) + "<header class=\"band\">\n" + nav(current) + body["header"] + "</header>\n\n<main id=\"main\">\n" + body["main"] + "</main>\n\n" + FOOTER + scripts + "</body>\n</html>\n"
    open(OUT + fname, "w").write(html)

# ---------------------------------------------------------------- Home
page("index.html", "FairSwipe | Card acceptance, itemized",
     "FairSwipe prices card acceptance line by line and tests every plan against real interchange costs and published competitor rates.",
     "Home",
     {"header": """  <div class="wrap hero">
    <div class="eyebrow">Card acceptance &nbsp;&bull;&nbsp; Itemized &nbsp;&bull;&nbsp; Fair</div>
    <h1>Every swipe, <em>itemized.</em></h1>
    <div class="ornament"><span></span></div>
    <p>FairSwipe shows merchants where each cent of a card fee goes, then prices plans that beat the big processors without losing money on the sale.</p>
    <div class="ctas">
      <a class="btn btn-light" href="#plans">See the plans</a>
      <a class="btn btn-ghost-light" href="analytics.html">Run the numbers</a>
    </div>
  </div>
""",
      "main": """  <!-- Stat strip: every figure is computed from data/providers.json by js/home.js -->
  <section class="block reveal" aria-label="Key figures">
    <div class="wrap stats" id="stats">
      <div class="stat"><b data-stat="passthrough">&nbsp;</b><span class="muted">of a Stripe <span data-ref="channel">online</span> fee goes to the card's bank and network, not to Stripe (<span data-ref="mix">60% credit, 40% debit</span> card mix)</span></div>
      <div class="stat"><b data-stat="saving">&nbsp;</b><span class="muted">saved per <span data-ref="ticket">$80</span> <span data-ref="channel">online</span> sale on FairSwipe <span id="savingPlan">Growth</span> versus Stripe's standard rate</span></div>
      <div class="stat"><b data-stat="rivals">4</b><span class="muted">processors benchmarked from their published US pricing pages</span></div>
    </div>
  </section>

  <!-- Receipt explainer (decision 1B): one sale broken into who gets paid -->
  <section class="block reveal" style="padding-top:0" aria-labelledby="receiptTitle">
    <div class="wrap split">
      <div>
        <div class="label">Where your fee goes</div>
        <h2 id="receiptTitle">One <span data-ref="ticket">$80</span> sale, line by line</h2>
        <p>Most of a card fee never reaches the processor. The largest share is <strong>interchange</strong>, set by Visa and Mastercard and paid to the customer's bank. A smaller network fee goes to the card brand. What is left is the processor's margin.</p>
        <p class="muted">FairSwipe prints this breakdown for every plan, so merchants see exactly what they are paying for.</p>
        <a class="btn btn-solid" href="analytics.html" style="margin-top:8px">Test your own numbers</a>
      </div>
      <div class="receipt" id="receipt" aria-live="polite">
        <div class="r-head">FairSwipe</div>
        <div class="r-sub">ONLINE SALE &middot; 60% CREDIT / 40% DEBIT &middot; GROWTH PLAN</div>
        <div id="receiptRows"></div>
      </div>
    </div>
  </section>

  <!-- Plan cards: rendered from the session plan list, so edits on Manage plans show up here -->
  <section class="block reveal" id="plans" style="padding-top:0" aria-labelledby="plansTitle">
    <div class="wrap">
      <div class="section-head">
        <div class="label">Plans</div>
        <h2 id="plansTitle">Priced in the open</h2>
        <div class="ornament"><span></span></div>
        <p class="muted">Flat plans charge one simple rate. Interchange-plus plans (IC +) pass card costs through at cost and add a fixed FairSwipe markup.</p>
      </div>
      <div class="plans" id="planCards"></div>
      <p class="hint" id="editedNote" hidden style="text-align:center;margin-top:16px">Showing plans you edited in this tab. <a href="manageplans.html">Manage plans</a></p>
    </div>
  </section>

  <section class="block reveal" style="padding-top:0" aria-labelledby="howTitle">
    <div class="wrap">
      <div class="section-head">
        <div class="label">How FairSwipe prices</div>
        <h2 id="howTitle">Three rules, no fine print</h2>
        <div class="ornament"><span></span></div>
      </div>
      <div class="steps">
        <div class="card step"><h3>Pass costs through</h3><p class="muted">Interchange and network fees are charged at cost on IC + plans and shown on every statement.</p></div>
        <div class="card step"><h3>Publish the markup</h3><p class="muted">FairSwipe's share is one visible line. No hidden tiers, no "qualified" and "non-qualified" rates.</p></div>
        <div class="card step"><h3>Beat the benchmark</h3><p class="muted">Every plan is tested against Stripe, Square, PayPal and Adyen before it ships. See the <a href="analytics.html">analytics</a>.</p></div>
      </div>
    </div>
  </section>
"""},
     """<script type="module" src="js/home.js"></script>
""")

# ---------------------------------------------------------------- Manage plans
page("manageplans.html", "FairSwipe | Manage plans",
     "Create, view, update and delete FairSwipe pricing plans and see each plan's price and margin on a sample sale.",
     "Manage plans",
     {"header": """  <div class="wrap page-head">
    <div class="label">Plan ledger</div>
    <h1>Manage plans</h1>
    <div class="ornament"><span></span></div>
    <p>Add, view, edit and retire FairSwipe pricing plans. Each row shows what the plan would charge on a sample <span data-ref="ticket">$80</span> <span data-ref="channel">online</span> sale and what FairSwipe keeps.</p>
  </div>
""",
      "main": """  <section class="block" style="padding-top:40px">
    <div class="wrap">
      <p class="notice" style="margin-bottom:20px">Demo edits are kept in this browser tab only. They carry over to the Home and Analytics pages and disappear when the tab closes.</p>

      <!-- Toolbar: search and filter are the "Read" side of CRUD, Add is "Create" -->
      <div class="toolbar">
        <div class="field grow">
          <label class="label" for="search">Search plans</label>
          <input id="search" type="search" placeholder="Growth, coffee, 0.5" autocomplete="off">
        </div>
        <div class="field">
          <label class="label" for="typeFilter">Pricing type</label>
          <select id="typeFilter">
            <option value="all">All types</option>
            <option value="flat">Flat rate</option>
            <option value="ic_plus">Interchange plus</option>
          </select>
        </div>
        <button class="btn btn-outline" id="resetBtn" type="button">Reset to defaults</button>
        <button class="btn btn-solid" id="addBtn" type="button">Add plan</button>
      </div>

      <div class="panel" style="padding:8px 8px 4px">
        <div class="table-wrap">
          <table>
            <caption class="sr-only">FairSwipe pricing plans</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Type</th>
                <th scope="col" class="r">Price</th>
                <th scope="col" class="r hide-sm">Monthly</th>
                <th scope="col" class="hide-sm">Target</th>
                <th scope="col" class="r">On <span data-ref="ticket">$80</span></th>
                <th scope="col" class="r">FairSwipe keeps</th>
                <th scope="col" class="r"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody id="planRows"></tbody>
          </table>
        </div>
        <p class="hint" id="emptyState" hidden style="padding:18px 12px">No plans match that search. Clear the search or add a plan.</p>
      </div>
      <p class="hint" style="margin-top:12px">"On <span data-ref="ticket">$80</span>" is the merchant's price for one <span data-ref="ticket">$80</span> <span data-ref="channel">online</span> sale (<span data-ref="mix">60% credit, 40% debit</span>, <span data-ref="volume">$50K</span> monthly volume). "FairSwipe keeps" is that price minus interchange, network fee and processing cost.</p>
    </div>
  </section>

  <!-- Create / update form. A native dialog: focus is trapped and Escape closes it, with no library. -->
  <dialog id="planDialog" aria-labelledby="dlgTitle">
    <form id="planForm" novalidate>
      <div class="dlg-head"><div class="label" id="dlgEyebrow">New plan</div><h2 id="dlgTitle" style="font-size:32px">Add plan</h2></div>
      <div class="dlg-body">
        <div class="field full">
          <label class="label" for="fName">Plan name</label>
          <input id="fName" name="name" type="text" maxlength="40" required>
          <span class="error" id="eName"></span>
        </div>
        <div class="field">
          <label class="label" for="fType">Pricing type</label>
          <select id="fType" name="type">
            <option value="flat">Flat rate</option>
            <option value="ic_plus">Interchange plus</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="fRate" id="fRateLabel">Rate (%)</label>
          <input id="fRate" name="rate_pct" type="number" step="0.01" min="0" max="10" required>
          <span class="error" id="eRate"></span>
        </div>
        <div class="field">
          <label class="label" for="fFixed">Fixed fee per sale ($)</label>
          <input id="fFixed" name="fixed_usd" type="number" step="0.01" min="0" max="2" required>
          <span class="error" id="eFixed"></span>
        </div>
        <div class="field">
          <label class="label" for="fMonthly">Monthly fee ($)</label>
          <input id="fMonthly" name="monthly_fee_usd" type="number" step="1" min="0" max="5000" required>
          <span class="error" id="eMonthly"></span>
        </div>
        <div class="field full">
          <label class="label" for="fTarget">Target merchant</label>
          <input id="fTarget" name="target" type="text" maxlength="60" placeholder="Restaurants with $50K monthly sales">
        </div>
        <p class="hint full" id="fPreview" aria-live="polite"></p>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-outline" type="button" data-close>Cancel</button>
        <button class="btn btn-solid" type="submit" id="saveBtn">Save plan</button>
      </div>
    </form>
  </dialog>

  <!-- Read: full detail for one plan -->
  <dialog id="viewDialog" aria-labelledby="viewTitle">
    <div class="dlg-head"><div class="label">Plan detail</div><h2 id="viewTitle" style="font-size:32px"></h2></div>
    <div class="dlg-body"><dl class="dl full" id="viewList"></dl></div>
    <div class="dlg-foot">
      <button class="btn btn-outline" type="button" data-close>Close</button>
      <button class="btn btn-solid" type="button" id="viewEdit">Edit plan</button>
    </div>
  </dialog>

  <!-- Delete confirmation, in-page instead of window.confirm() so it matches the design -->
  <dialog id="deleteDialog" aria-labelledby="delTitle">
    <div class="dlg-head"><div class="label">Delete plan</div><h2 id="delTitle" style="font-size:32px"></h2></div>
    <div class="dlg-body"><p class="full" style="margin:0">This removes the plan from this tab's plan list. Reset to defaults brings the original plans back.</p></div>
    <div class="dlg-foot">
      <button class="btn btn-outline" type="button" data-close>Keep plan</button>
      <button class="btn btn-danger" type="button" id="confirmDelete">Delete plan</button>
    </div>
  </dialog>
"""},
     """<script type="module" src="js/manage.js"></script>
""")

# ---------------------------------------------------------------- Analytics
page("analytics.html", "FairSwipe | Analytics",
     "Test FairSwipe plans against real interchange costs and Stripe, Square, PayPal and Adyen pricing for different merchants.",
     "Analytics",
     {"header": """  <div class="wrap page-head">
    <div class="label">Plan economics</div>
    <h1>Does the plan pay?</h1>
    <div class="ornament"><span></span></div>
    <p>Pick a merchant, adjust the sale and cost assumptions, and see what each plan charges, what FairSwipe keeps, and whether it beats the competition.</p>
  </div>
""",
      "main": """  <section class="block" style="padding-top:40px">
    <div class="wrap analytics-grid">

      <!-- Controls (decisions 4B and 2C): merchant inputs and FairSwipe's cost structure -->
      <aside class="panel controls" aria-label="Scenario controls">
        <fieldset>
          <legend>Merchant</legend>
          <div class="field">
            <label class="label" for="merchant">Profile</label>
            <select id="merchant"></select>
          </div>
          <div class="field">
            <div class="row-label"><label class="label" for="ticket">Average sale</label><output id="ticketOut" for="ticket"></output></div>
            <input id="ticket" type="range" min="2" max="1000" step="1">
          </div>
          <div class="field">
            <div class="row-label"><label class="label" for="debit">Debit share</label><output id="debitOut" for="debit"></output></div>
            <input id="debit" type="range" min="0" max="100" step="5">
          </div>
          <div class="field">
            <div class="row-label"><label class="label" for="volume">Monthly sales</label><output id="volumeOut" for="volume"></output></div>
            <input id="volume" type="range" min="0" step="1">
          </div>
        </fieldset>
        <fieldset>
          <legend>Cost structure</legend>
          <div class="field">
            <div class="row-label"><label class="label" for="procCost">Processing cost per sale</label><output id="procOut" for="procCost"></output></div>
            <input id="procCost" type="range" min="0" max="0.2" step="0.01">
          </div>
          <div class="field">
            <div class="row-label"><label class="label" for="netFee">Network fee</label><output id="netOut" for="netFee"></output></div>
            <input id="netFee" type="range" min="0.05" max="0.3" step="0.01">
          </div>
          <p class="hint" style="margin:0">Both are assumptions. Interchange and competitor rates are fixed to their published sources.</p>
        </fieldset>
        <button class="btn btn-outline" id="resetScenario" type="button">Reset scenario</button>
      </aside>

      <div>
        <div class="kpis" aria-live="polite">
          <div class="kpi"><div class="label">Best plan for this merchant</div><b id="kPlan">&nbsp;</b><small id="kPlanSub"></small></div>
          <div class="kpi"><div class="label">FairSwipe monthly profit</div><b id="kProfit" class="pos">&nbsp;</b><small id="kProfitSub"></small></div>
          <div class="kpi"><div class="label">Margin on each sale</div><b id="kMargin" class="pos">&nbsp;</b><small id="kMarginSub"></small></div>
          <div class="kpi"><div class="label" id="kSaveLabel">Merchant saves vs Stripe</div><b id="kSave">&nbsp;</b><small>per month</small></div>
        </div>
        <p class="finder" id="finder" aria-live="polite"></p>

        <!-- Chart 1: stacked fee breakdown with competitor bars (decision 3B) -->
        <div class="panel" style="margin-top:18px">
          <div class="panel-head">
            <div><div class="label">Price per sale</div><h2>Who gets paid on each sale</h2></div>
            <div class="legend-inline" id="breakdownLegend"></div>
          </div>
          <div class="chart-box tall"><canvas id="breakdownChart" role="img" aria-label="Stacked bars of interchange, network fee, processing cost and FairSwipe margin for each plan, next to competitor prices"></canvas></div>
          <details class="table-view">
            <summary>Show as table</summary>
            <div class="table-wrap"><table id="breakdownTable"></table></div>
          </details>
        </div>

        <!-- Chart 2: monthly profit as volume grows (decision 3C) -->
        <div class="panel">
          <div class="panel-head">
            <div><div class="label">Scale</div><h2>When each plan becomes the better deal</h2></div>
            <div class="legend-inline" id="curveLegend"></div>
          </div>
          <div class="chart-box"><canvas id="curveChart" role="img" aria-label="Line chart of the merchant effective rate for each FairSwipe plan across monthly sales volumes, with Stripe and the cheapest other competitor as dashed reference lines"></canvas></div>
          <p class="hint" style="margin:12px 0 0">A monthly fee is spread across every sale, so subscription plans look expensive for small merchants and become the cheapest option as sales grow. At the smallest sizes a subscription plan can run off the top of the chart. Where a solid line drops below a dashed one, that plan beats the competitor. Hover to see what FairSwipe earns at each size.</p>
          <details class="table-view">
            <summary>Show as table</summary>
            <div class="table-wrap"><table id="curveTable"></table></div>
          </details>
        </div>

        <div class="panel">
          <div class="label">Method and limits</div>
          <h2 style="font-size:28px;margin:6px 0 12px">How these numbers are built</h2>
          <ul class="small" style="padding-left:18px;margin:0">
            <li>Interchange uses Visa's published consumer credit rates (card present 1.43% + $0.10, card not present 1.89% + $0.10) and the regulated debit rate (0.05% + $0.21, plus $0.01 fraud adjustment). <a href="https://usa.visa.com/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf" target="_blank" rel="noopener">Visa, effective April 18, 2026</a>.</li>
            <li>These are the lowest consumer credit tiers. Rewards and premium cards cost more, so real interchange is usually higher.</li>
            <li>Regulated debit applies to large banks only. Debit cards from smaller banks carry higher interchange.</li>
            <li>Competitor prices are each provider's standard published US rate. Negotiated pricing, Adyen's unpublished minimum invoice and add-on fees are excluded.</li>
            <li>FairSwipe plans, processing cost and network fee are scenario inputs. Edit plans on <a href="manageplans.html">Manage plans</a>.</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
"""},
     """<!-- Chart.js loads only on this page, deferred, so it never blocks the first paint -->
<script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script type="module" src="js/analytics.js"></script>
""")

# ---------------------------------------------------------------- About
page("aboutus.html", "FairSwipe | About",
     "About Felipe Toro, the developer of FairSwipe, and how the site was built.",
     "About",
     {"header": """  <div class="wrap page-head">
    <div class="label">About the developer</div>
    <h1>Felipe Toro</h1>
    <div class="ornament"><span></span></div>
    <p>Pricing strategy &nbsp;&bull;&nbsp; Business intelligence &nbsp;&bull;&nbsp; Applied machine learning</p>
  </div>
""",
      "main": """  <section class="block reveal">
    <div class="wrap about-grid">
      <div>
        <div class="monogram" aria-hidden="true">FT</div>
        <h2 style="font-size:34px">Pricing work, built like software</h2>
        <ul class="facts">
          <li><span class="label">Based in</span><br>Tampa, Florida</li>
          <li><span class="label">Education</span><br>M.S. Artificial Intelligence and Business Analytics, University of South Florida (expected May 2027)<br>B.S. Industrial Engineering, University of South Florida</li>
          <li><span class="label">Find me</span><br><a href="https://github.com/FelipeToroG" target="_blank" rel="noopener">github.com/FelipeToroG</a></li>
        </ul>
      </div>
      <div>
        <p style="font-size:18px">I lead pricing and business intelligence at an electronics manufacturer that supports federal defense programs. I built the company's first BI function from scratch and own cost and pricing analysis on proposals across a pipeline of more than $300 million.</p>
        <p>Before that I co-founded iGEN, a CAD/CAM services firm, and scaled it to more than 25 remote employees. The common thread is turning messy cost data into prices a business can defend.</p>
        <p>Outside of work I build production-grade machine learning projects. My focus is systems that hold up under review: tested, observable, and where every model or language-model output can be traced back to cited evidence.</p>
        <ol class="timeline" style="margin-top:28px">
          <li><div class="label">Now</div>Business Intelligence Engineer and pricing lead, defense electronics manufacturing</li>
          <li><div class="label">Also</div>Leads the proposal development team on federal bids</li>
          <li><div class="label">Founder</div>Co-founder, iGEN (CAD/CAM services), grew to 25+ remote employees</li>
        </ol>
      </div>
    </div>
  </section>

  <section class="block reveal" style="padding-top:0" aria-labelledby="projTitle">
    <div class="wrap">
      <div class="section-head"><div class="label">Portfolio</div><h2 id="projTitle">Selected projects</h2><div class="ornament"><span></span></div></div>
      <div class="plans">
        <a class="card repo" href="https://github.com/FelipeToroG/ml-fraud-detection-pipeline" target="_blank" rel="noopener">
          <div class="label">Machine learning</div>
          <h3>Fraud detection pipeline</h3>
          <p class="muted small">Card-fraud classifier tuned to a dollar cost matrix instead of accuracy, choosing the decision threshold that minimizes expected loss.</p>
          <div class="stack"><span class="badge">Python</span><span class="badge">Optuna</span><span class="badge">MLflow</span><span class="badge">FastAPI</span><span class="badge">Docker</span></div>
        </a>
        <a class="card repo" href="https://github.com/FelipeToroG/aml-transaction-monitoring" target="_blank" rel="noopener">
          <div class="label">Machine learning</div>
          <h3>AML transaction monitoring</h3>
          <p class="muted small">Anti-money-laundering alert ranking on a five-million-row transaction dataset, evaluated on cost-weighted precision at the top of the review queue.</p>
          <div class="stack"><span class="badge">Python</span><span class="badge">scikit-learn</span><span class="badge">pytest</span></div>
        </a>
        <a class="card repo" href="https://github.com/FelipeToroG/fintech-pricing-lab" target="_blank" rel="noopener">
          <div class="label">This site</div>
          <h3>FairSwipe</h3>
          <p class="muted small">Static pricing lab for a fictional payments startup. Every competitor and interchange figure is cited to its source.</p>
          <div class="stack"><span class="badge">HTML</span><span class="badge">CSS</span><span class="badge">JavaScript</span><span class="badge">Chart.js</span></div>
        </a>
      </div>
    </div>
  </section>

  <section class="block reveal" style="padding-top:0" aria-labelledby="buildTitle">
    <div class="wrap split" style="align-items:start">
      <div>
        <div class="label">How this site was built</div>
        <h2 id="buildTitle">Data first, then design</h2>
        <p>I started with the data, not the pages. Published fees from Stripe, Square, PayPal and Adyen, plus Visa's interchange schedule, went into one normalized JSON file with a source link and capture date on every number. FairSwipe's own plans and cost assumptions live in a separate file, so invented scenario values can never be confused with cited facts.</p>
        <p>One pricing module turns that data into every number on the site: the receipt on the home page, the plan table, the KPI tiles and both charts. Changing a plan or a slider recalculates everything from the same functions.</p>
        <p>The hardest part was honesty in the model. On small in-person sales, card costs plus FairSwipe's own processing cost come to more than Stripe charges, so no FairSwipe plan undercuts it there. The analytics page says so instead of hiding it.</p>
      </div>
      <div class="card">
        <div class="label">Technologies</div>
        <ul class="facts" style="margin-top:8px">
          <li><b>HTML5</b>: semantic pages, native dialog elements for the add, view, edit and delete forms</li>
          <li><b>CSS</b>: custom properties as design tokens, light and dark themes, grid layouts, no framework</li>
          <li><b>JavaScript</b>: ES modules, a pure-function pricing model, session storage for demo edits</li>
          <li><b>Chart.js</b>: stacked bar and line charts, loaded only on the analytics page</li>
          <li><b>JSON</b>: cited fee data and scenario inputs, documented in SCHEMA.md</li>
          <li><b>GitHub Pages</b>: static hosting straight from the repository</li>
        </ul>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
          <a class="btn btn-solid" href="https://github.com/FelipeToroG/fintech-pricing-lab" target="_blank" rel="noopener">View the code</a>
          <a class="btn btn-outline" href="https://github.com/FelipeToroG" target="_blank" rel="noopener">GitHub profile</a>
        </div>
        <p class="hint" style="margin:16px 0 0">Built for ISM 6225 Application Development for Analytics, University of South Florida, Fall 2026.</p>
      </div>
    </div>
  </section>
"""},
     """<script type="module" src="js/about.js"></script>
""")
print("pages written")
