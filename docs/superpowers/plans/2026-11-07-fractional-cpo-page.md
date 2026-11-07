# Fractional CPO Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the alexkonyakhin.com homepage as the Fractional CPO page described in the spec, with a check script that proves the copy, links, metadata and public bundle match it.

**Architecture:** One static page (`index.html`) styled by `styles.css`, staged into `dist/` by the existing `scripts/site.py`. A new `scripts/check.py` (standard library only) parses the page and the AI profile and fails on any deviation from the spec's required text, exact hrefs, metadata, forbidden claims and public-file set. Each page section is its own task: extend the checks, see them fail, change the HTML/CSS, see them pass, commit.

**Tech Stack:** HTML, CSS, Python 3 standard library (`html.parser`, `json`). No framework, no package manager, no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-07-fractional-cpo-page-design.md`

## Global Constraints

- Copy is taken from the spec §3 verbatim; only the exact strings there may appear. No new claims, no numbers outside spec §4.
- Private names never appear in any file: the retail client, the two unnamed current roles, the source notes. The repository is public.
- Exact destinations: `mailto:me@alexkonyakhin.com`, `https://linkedin.com/in/alexkonyakhin`, `https://t.me/pieceofwave`, `https://copix.app/`, `https://nicepass.cc/`, `https://stopwell.app/`, `https://vpnkill.com/`.
- Booking URL not yet supplied: every "Book a 30-minute call" link uses the mailto above. When a URL arrives, all of them change together.
- Public bundle stays exactly six files: `index.html`, `styles.css`, `ava_alex_konyakhin.png`, `llms.txt`, `robots.txt`, `CNAME`. `scripts/site.py` and the Pages workflow are not modified.
- GA4 `G-K466B003HF` loads only when `window.location.hostname` is `alexkonyakhin.com` or `www.alexkonyakhin.com`. The only new event is `cta_click` with `cta` ∈ {`book_call`, `email`} and `location` ∈ {`hero`, `work`, `contact`}.
- No new fonts, scripts from third parties, forms or embeds. Visual system per spec §6.
- `lang="en"`, one `<h1>`, unique ids, skip link, 44px minimum interactive height, text contrast ≥ 4.5:1.
- Commits go to branch `codex/product-leadership-update`. Nothing is pushed to `main`; no pull request into `main` without explicit confirmation.

## Review Focus

1. An in-page link whose fragment matches no element id scrolls nowhere and fails silently. Test: Task 1's `check_anchors` asserts every `href="#…"` resolves to an existing id.
2. On a 360px phone the trust strip's separator dots can start a wrapped line, and proof tiles can break mid-number. Test: Task 10 reviews 360px screenshots; Task 3 CSS switches the strip to one item per line below 700px with no dots. (Resolved in the final fix pass: the dot appeared at 1280px, so the strip became a two-column grid with no separators; the browser assertion is in the ledger.)
3. If the production hostname list drops `www.` or the no-op tracker is missing, either analytics stops on one host or clicks throw `ReferenceError` on localhost. Test: Task 2's `check_analytics` asserts both hostnames are present and `window.trackCta` is assigned before the gated block.
4. A booking button left as `href="#"` or with one stale mailto among three is a dead primary action. Test: Task 1's `check_ctas` asserts all `data-cta="book_call"` hrefs are identical and are either the mailto or an `https://` URL.
5. `llms.txt` drifting from the page gives AI answers that contradict the site. Test: Task 9's `check_llms` asserts every number from spec §4 that is on the page also appears in `llms.txt`.

---

### Task 1: Check script

**Files:**
- Create: `scripts/check.py`
- Modify: `.gitignore` (no change needed; `__pycache__/` already ignored)
- Modify: tracked `.DS_Store` removed from the index (`git rm --cached`)

**Interfaces:**
- Produces: `python3 scripts/check.py [--forbidden-file PATH]` exits 0 when all checks pass, 1 otherwise, printing one `FAIL: …` line per failure.
- Produces: module-level lists later tasks append to: `REQUIRED_HTML: list[str]`, `REQUIRED_LLMS: list[str]`, `FORBIDDEN: list[str]`, `EXACT_HREFS: set[str]`, `REQUIRED_CTAS: set[tuple[str, str]]`.
- Produces: `PageFacts` dataclass from `parse_page(html: str) -> PageFacts` with fields `title: str`, `lang: str`, `description: str`, `h1_count: int`, `ids: list[str]`, `hrefs: list[str]`, `fragments: list[str]`, `ld_json: str`, `ctas: list[tuple[str, str, str]]` (cta, location, href), `text: str` (visible text with whitespace collapsed).
- Produces: check functions, each `(…) -> list[str]` of failure messages: `check_required(text, required)`, `check_forbidden(text, forbidden)`, `check_hrefs(facts)`, `check_anchors(facts)`, `check_ctas(facts)`, `check_structure(facts)` (one h1, unique ids, lang en), `check_ld_json(facts)` (parses; `@type` Person; keys asserted in Task 2), `check_analytics(html)` (asserted in Task 2), `check_llms(llms_text)` (Task 9), `check_dist()` (dist contains exactly `PUBLIC_FILES` from `scripts/site.py`, loaded with `importlib.util.spec_from_file_location("site_build", ROOT / "scripts" / "site.py")`, never `import site`, which is a Python standard-library module).

- [ ] **Step 1: Stop tracking `.DS_Store`**

Run: `git rm --cached .DS_Store && git status --short`
Expected: `D  .DS_Store` staged; file still on disk.

- [ ] **Step 2: Write `scripts/check.py` with the interfaces above and these initial values**

`REQUIRED_HTML = ["Fractional CPO for founder-led software companies."]`
`REQUIRED_LLMS = []`
`FORBIDDEN = ["17+", "40+", "×5 ARR", "5× over", "3× conversion", "$1M", "₽", "RUB", "world-class", "full-stack executive"]` (never a bare `5×`: it would match the legitimate `2.15×`).
`EXACT_HREFS` = the seven destinations in Global Constraints.
`REQUIRED_CTAS = {("book_call", "hero"), ("book_call", "work"), ("book_call", "contact"), ("email", "contact")}`

`parse_page` uses `html.parser.HTMLParser`; it records `data-cta` / `data-cta-location` / `href` on `<a>` tags, `id` on any tag, `lang` on `<html>`, `<title>` text, `<meta name="description">` content, the text of `<script type="application/ld+json">`, and visible text excluding `<script>` and `<style>`.

`check_hrefs`: every `href` that starts with `http` or `mailto:` must be in `EXACT_HREFS`.
`check_anchors`: every `href` starting with `#` must match an id (skip-link target `main` included).
`check_ctas`: `REQUIRED_CTAS ⊆ {(cta, location)}`; all `book_call` hrefs identical and either `mailto:me@alexkonyakhin.com` or starting with `https://`; every `email` href is the mailto.
`main` appends the lines of `--forbidden-file` (one term per line, blank lines ignored) to `FORBIDDEN` before running `check_forbidden`; the check function itself stays pure.
`main` runs every check on `index.html`, `llms.txt` and `dist/` (dist check only if `dist/` exists), prints failures, exits 1 if any.

- [ ] **Step 3: Run the checks against the Codex draft to confirm they fail for the right reasons**

Run: `python3 scripts/check.py`
Expected: exit 1; output includes `FAIL: missing text: Fractional CPO for founder-led software companies.` and `FAIL: forbidden text: ₽` and `FAIL: missing CTA ('book_call', 'hero')`. No Python traceback.

- [ ] **Step 4: Run the checks against a known-good fixture to confirm they can pass**

Run: `python3 -c "import sys; sys.path.insert(0,'scripts'); import check; f=check.parse_page('<html lang=en><head><title>t</title></head><body><a class=skip-link href=#main>s</a><h1>Fractional CPO for founder-led software companies.</h1><main id=main><a data-cta=book_call data-cta-location=hero href=mailto:me@alexkonyakhin.com>b</a><a data-cta=book_call data-cta-location=work href=mailto:me@alexkonyakhin.com>b</a><a data-cta=book_call data-cta-location=contact href=mailto:me@alexkonyakhin.com>b</a><a data-cta=email data-cta-location=contact href=mailto:me@alexkonyakhin.com>e</a></main></body></html>'); print(check.check_required(f.text, check.REQUIRED_HTML)+check.check_hrefs(f)+check.check_anchors(f)+check.check_ctas(f)+check.check_structure(f))"`
Expected: `[]`

- [ ] **Step 5: Commit**

```bash
git add scripts/check.py
git commit -m "Add check script for page copy, links, metadata and public bundle; untrack .DS_Store"
```

---

### Task 2: Head metadata, structured data and analytics

**Files:**
- Modify: `index.html` lines 1–47 (the `<head>`)
- Modify: `scripts/check.py` (`check_ld_json`, `check_analytics`, `REQUIRED_HTML`)

**Interfaces:**
- Consumes: Task 1 lists and functions.
- Produces: `window.trackCta(cta: string, location: string): void`, a no-op unless on a production host; `<body>` tasks attach `data-cta` and `data-cta-location` and rely on one delegated click listener added in Task 8.

- [ ] **Step 1: Extend the checks**

In `check_ld_json`: parse `facts.ld_json`; assert `@type == "Person"`, `jobTitle == "Fractional CPO"`, `address.addressLocality == "Belgrade"`, `address.addressCountry == "RS"`, `knowsLanguage == ["en", "sr", "ru"]`, `sameAs` equals the LinkedIn and Telegram URLs, and that none of `worksFor`, `owns`, `aggregateRating`, `review` is present.
In `check_analytics(html)`: assert the literal `'alexkonyakhin.com', 'www.alexkonyakhin.com'` appears, `G-K466B003HF` appears exactly twice (config and script src), `window.trackCta = function` appears before the hostname `if`, and `'cta_click'` appears.
Add `check_meta(facts) -> list[str]`: `facts.title == "Alexey Konyakhin · Fractional CPO · Belgrade (CET)"` and `facts.description` equals the spec §7 description string. Wire it into `main`.

- [ ] **Step 2: Run to verify the new checks fail**

Run: `python3 scripts/check.py`
Expected: failures include `FAIL: jobTitle`, `FAIL: title`, `FAIL: analytics: trackCta`.

- [ ] **Step 3: Rewrite the `<head>` per spec §7**

Keep charset, viewport, canonical, theme-color, icon and stylesheet link as in the Codex draft. Replace title, description, Open Graph title and description (H1 and subhead from spec §3.2), and the JSON-LD block. Analytics script becomes:

```js
window.trackCta = function () {};
if (['alexkonyakhin.com', 'www.alexkonyakhin.com'].includes(window.location.hostname)) {
  /* existing dataLayer, gtag(), config and async loader, unchanged */
  window.trackCta = function (cta, location) {
    gtag('event', 'cta_click', { cta: cta, location: location });
  };
}
```

- [ ] **Step 4: Run to verify the head checks pass**

Run: `python3 scripts/check.py 2>&1 | grep -E "jobTitle|title|analytics|ld_json" || echo "head checks clean"`
Expected: `head checks clean`

- [ ] **Step 5: Commit**

```bash
git add index.html scripts/check.py
git commit -m "Head: Fractional CPO metadata, Person structured data with Belgrade, gated CTA tracking"
```

---

### Task 3: Header and first screen

**Files:**
- Modify: `index.html` header and `<section class="hero">`
- Modify: `styles.css` (`h1` max-width, `.identity-role`, new `.trust-strip`)
- Modify: `scripts/check.py` (`REQUIRED_HTML`)

**Interfaces:**
- Produces: section ids `work`, `how-i-work`, `background`, `contact` are the nav and anchor targets used by Tasks 5–8; `main` keeps `id="main"`.

- [ ] **Step 1: Add required strings**

Append to `REQUIRED_HTML`: the role line `Fractional CPO · Belgrade`, the subhead, the fit line, the four trust-strip items, `Book a 30-minute call`, `See the work`, all verbatim from spec §3.2.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 scripts/check.py | grep -c "missing text"`
Expected: `9` or more.

- [ ] **Step 3: Rewrite the header and hero**

Header: identity block unchanged except the role text; nav links in page order `Work` → `#work`, `How I work` → `#how-i-work`, `Background` → `#background`.
Hero: `<h1>`, `<p class="hero-intro">` subhead, `<p class="hero-fit">` fit line, `<ul class="trust-strip">` with four `<li>`, then `.actions` with `<a class="button" data-cta="book_call" data-cta-location="hero" href="mailto:me@alexkonyakhin.com">` and the existing `.text-link` to `#work` with the down-arrow SVG.
CSS: `h1 { max-width: 18ch; }`; `.trust-strip` is a flex row with wrap, `list-style: none`, `font-size: .875rem`, `color: var(--muted)`, `gap: var(--space-2) var(--space-4)`; `.trust-strip li + li::before { content: "·"; margin-right: var(--space-4); }`; at `max-width: 700px` the strip becomes a column with the `::before` removed.

- [ ] **Step 4: Run to verify the hero strings pass**

Run: `python3 scripts/check.py | grep "missing text" || echo "no missing text"`
Expected: `no missing text`

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css scripts/check.py
git commit -m "First screen: Fractional CPO headline, fit line, trust strip, booking CTA"
```

---

### Task 4: Proof band

**Files:**
- Modify: `index.html` (new `<section class="proof" aria-label="Key facts">` directly after the hero)
- Modify: `styles.css` (new `.proof-band`, `.proof-num`, `.proof-label`, `.proof-note`)
- Modify: `scripts/check.py` (`REQUIRED_HTML`)

- [ ] **Step 1: Add required strings**

Append the four numerals, four labels and four qualifiers from spec §3.3 to `REQUIRED_HTML` (twelve strings, for example `300k+`, `monthly active users`, `employee app I owned as head of product`).

- [ ] **Step 2: Run to verify they fail**

Run: `python3 scripts/check.py | grep -c "missing text"`
Expected: `12`

- [ ] **Step 3: Add the proof band**

Markup: `<ul class="proof-band">` with four `<li>`, each `<strong class="proof-num">`, `<span class="proof-label">`, `<span class="proof-note">`.
CSS: grid with `grid-template-columns: repeat(4, 1fr)`, `gap: var(--space-5)`, `padding-block: var(--space-6)`, top border `var(--line)`; `.proof-num` at `font-size: 2.5rem`, `font-weight: 550`, `letter-spacing: -.02em`, `font-variant-numeric: tabular-nums`, `line-height: 1.1`; `.proof-label` body size; `.proof-note` `.8125rem` muted. At `max-width: 700px`: `repeat(2, 1fr)`.

- [ ] **Step 4: Run to verify they pass**

Run: `python3 scripts/check.py | grep "missing text" || echo "no missing text"`
Expected: `no missing text`

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css scripts/check.py
git commit -m "Proof band: four verified facts under the first screen"
```

---

### Task 5: Work section

**Files:**
- Modify: `index.html` (`<section id="work">`, replacing the Codex cases and the `.work-contact` block)
- Modify: `scripts/check.py` (`REQUIRED_HTML`, `FORBIDDEN`)

- [ ] **Step 1: Add required and forbidden strings**

Append to `REQUIRED_HTML`: both case titles, both context lines, both body paragraphs, the three contribution leads (`Analytics from events to decisions.`, `A recruitment journey.`, `A learning game.`), the three contribution sentences, the Copix note, all verbatim from spec §3.4. The results rows are checked as parts because they render as label, value and qualifier: `Monthly active users`, `300k+`, `during my time on the product`, `Job applications`, `20,000`, `first three months of the recruitment journey`, `Monthly card turnover`, `3×`, `April 2024 to June 2026`, `Turnover per active printer`, `2.15×`.
Append the pilot counts and ruble amounts that must not return to the private terms file outside the repository (Task 10), not to `FORBIDDEN`: committed literals would publish the very figures they guard.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 scripts/check.py | grep -E "missing text|forbidden" | wc -l`
Expected: a count of at least 13 (missing strings plus the forbidden pilot and ruble figures still present).

- [ ] **Step 3: Rewrite the Work section**

Two `<article class="case">` blocks reusing the Codex `.case-heading`, `.case-context`, `.case-results`, `.case-contribution` and `.case-note` styles. Results: `<dl class="case-results">` with one `<div>` per result, `<dt>` label (`Monthly active users`, `Job applications`, `Monthly card turnover`, `Turnover per active printer`), `<dd>` value (`300k+`, `20,000`, `3×`, `2.15×`) and inside the `<dd>` a `<span>` qualifier (`during my time on the product`, `first three months of the recruitment journey`, `April 2024 to June 2026`, empty for the last one). Retail first. The Copix `<h3>` wraps the name in `<a href="https://copix.app/">`. Contributions use `<h4>` leads and one `<p>` each. The learning-game block is a `.case-contribution` like the other two, not `.case-secondary`. After the second case: `<div class="work-contact"><a class="button" data-cta="book_call" data-cta-location="work" href="mailto:me@alexkonyakhin.com">Book a 30-minute call</a></div>`. Delete the `.case-secondary` rule from `styles.css` if no longer used.

- [ ] **Step 4: Run to verify they pass**

Run: `python3 scripts/check.py | grep -E "missing text|forbidden" || echo "work clean"`
Expected: `work clean`

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css scripts/check.py
git commit -m "Work: retail employee app and Copix cases, multipliers only, pilot counts removed"
```

---

### Task 6: Situations and How I work

**Files:**
- Modify: `index.html` (new `<section class="section situations-section">`; rewrite Codex's `<section id="how-we-work">` as `<section id="how-i-work">`; delete the Codex "Is this your situation?" section)
- Modify: `styles.css` (new `.situations-compact`; remove `.situations`, `.situation`, `.section-closing`)
- Modify: `scripts/check.py` (`REQUIRED_HTML`, `FORBIDDEN`)

- [ ] **Step 1: Add required and forbidden strings**

Append to `REQUIRED_HTML`: heading `When founders call me`, the three situation lines, the three step titles and bodies, the "who does what" paragraph and the "Not included" line, verbatim from spec §3.5–3.6.
Append to `FORBIDDEN`: `Is this your situation?`, `One priority. Clear responsibilities.`, `Start with a paid first month`.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 scripts/check.py | grep -E "missing text|forbidden" | wc -l`
Expected: at least 13.

- [ ] **Step 3: Write the two sections**

Situations: `<h2>` then `<ul class="situations-compact">` with three `<li><strong>…</strong></li>`. CSS: `list-style: none; padding: 0; display: grid; gap: var(--space-3); font-size: 1.125rem; line-height: 1.5;`.
How I work: keep `<ol class="steps">` with three `<li><h3>…</h3><p>…</p></li>`; keep `<div class="responsibilities">` with `<h3>Who does what</h3>`, one `<p>` for the three owners, and `<p class="scope-note">` for "Not included: …".

- [ ] **Step 4: Run to verify they pass**

Run: `python3 scripts/check.py | grep -E "missing text|forbidden" || echo "process clean"`
Expected: `process clean`

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css scripts/check.py
git commit -m "Situations in three lines; How I work as paid first month, then monthly, with checkpoints"
```

---

### Task 7: Background timeline and own products

**Files:**
- Modify: `index.html` (replace `<section id="about">` with `<section id="background">`)
- Modify: `styles.css` (new `.timeline`; keep `.maker-work`, `.project-links`)
- Modify: `scripts/check.py` (`REQUIRED_HTML`, `FORBIDDEN`)

- [ ] **Step 1: Add required and forbidden strings**

Append to `REQUIRED_HTML`: `Background`, the eight timeline rows that have final wording (every row in spec §3.7 except the 2026 row), each as `years` and `role` strings, plus `I also build my own products.` and the three product names.
Append to `FORBIDDEN`: `About me`, `Rostok` (no URL supplied), `unnamed` (spec §5 fallback: plain description).
The 2026 row is omitted (spec §5 fallback) unless the owner has supplied public wording before this task runs; if so, add that row to `REQUIRED_HTML` instead.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 scripts/check.py | grep -E "missing text|forbidden" | wc -l`
Expected: at least 20.

- [ ] **Step 3: Write the section**

`<h2>Background</h2>`, then `<dl class="timeline">` with one `<div><dt>years</dt><dd>role</dd></div>` per row, newest first. Then `<div class="maker-work"><p>I also build my own products.</p><div class="project-links">…</div></div>` with the three links.
CSS: `.timeline { display: grid; gap: var(--space-4); }`, `.timeline > div { display: grid; grid-template-columns: 7rem 1fr; gap: var(--space-4); }`, `.timeline dt { color: var(--muted); font-size: .9375rem; font-variant-numeric: tabular-nums; }`, `.timeline dd { font-size: 1rem; }`; at `max-width: 700px` the row becomes one column with `gap: var(--space-1)`.

- [ ] **Step 4: Run to verify they pass**

Run: `python3 scripts/check.py | grep -E "missing text|forbidden" || echo "background clean"`
Expected: `background clean`

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css scripts/check.py
git commit -m "Background: dated roles-only timeline and own products"
```

---

### Task 8: Contact, footer and click tracking

**Files:**
- Modify: `index.html` (`<section id="contact">`, `<footer>`, delegated click script before `</body>`)
- Modify: `scripts/check.py` (`REQUIRED_HTML`)

- [ ] **Step 1: Add required strings**

Append: `Let's talk about your product.`, the contact prompt, `me@alexkonyakhin.com`, `Belgrade` (footer), `LinkedIn`, `Telegram`, verbatim from spec §3.8–3.9.

- [ ] **Step 2: Run to verify they fail and that the CTA set is still incomplete**

Run: `python3 scripts/check.py | grep -E "missing text|missing CTA"`
Expected: lines for the contact strings and `FAIL: missing CTA ('email', 'contact')`.

- [ ] **Step 3: Write contact, footer and the listener**

Contact: `<h2>`, `<p>` prompt, `<a class="button" data-cta="book_call" data-cta-location="contact" href="mailto:me@alexkonyakhin.com">Book a 30-minute call</a>`, `<a class="email-address" data-cta="email" data-cta-location="contact" href="mailto:me@alexkonyakhin.com">me@alexkonyakhin.com</a>`.
Footer: `<p>Alexey Konyakhin · Belgrade</p>` and the two social links.
Before `</body>`:

```html
<script>
  document.addEventListener('click', function (event) {
    var link = event.target.closest('[data-cta]');
    if (link) { window.trackCta(link.getAttribute('data-cta'), link.getAttribute('data-cta-location')); }
  });
</script>
```

- [ ] **Step 4: Run the full check**

Run: `python3 scripts/check.py && echo "ALL CHECKS PASS"`
Expected: `ALL CHECKS PASS` (dist check skipped if `dist/` absent).

- [ ] **Step 5: Commit**

```bash
git add index.html scripts/check.py
git commit -m "Contact and footer; delegated CTA click tracking"
```

---

### Task 9: AI profile and README

**Files:**
- Modify: `llms.txt` (full rewrite)
- Modify: `README.md` (description paragraph and the Checks section)
- Modify: `scripts/check.py` (`REQUIRED_LLMS`, `check_llms`)

- [ ] **Step 1: Add the profile checks**

`REQUIRED_LLMS = ["Fractional CPO", "Belgrade", "English and Serbian", "300,000", "20,000", "3 times", "2.15", "April 2024", "June 2026", "paid first month", "me@alexkonyakhin.com", "https://linkedin.com/in/alexkonyakhin", "https://t.me/pieceofwave"]`.
`check_llms` asserts each is present and runs `check_forbidden` on the profile with the same `FORBIDDEN` list.

- [ ] **Step 2: Run to verify it fails**

Run: `python3 scripts/check.py | grep "llms"`
Expected: `FAIL: llms.txt missing: Fractional CPO` and others.

- [ ] **Step 3: Rewrite `llms.txt` and update `README.md`**

`llms.txt` follows the page order: heading with name, one-line positioning, Location and languages, Engagement, Work (both cases with the same facts and the Copix link), Background (the timeline rows), Products, Contact. Plain text, numbers written out where the page uses symbols (`3 times`, `300,000`).
`README.md`: first paragraph describes the Fractional CPO page; Checks section adds `python3 scripts/check.py` before the manual viewport review and notes the optional `--forbidden-file`.

- [ ] **Step 4: Run the full check**

Run: `python3 scripts/check.py && echo "ALL CHECKS PASS"`
Expected: `ALL CHECKS PASS`

- [ ] **Step 5: Commit**

```bash
git add llms.txt README.md scripts/check.py
git commit -m "AI profile and README match the Fractional CPO page"
```

---

### Task 10: Build, private-term scan and browser verification

**Files:**
- Create: `.claude/launch.json` (preview server definition) and add `.claude/` to `.gitignore`
- No source changes expected; fixes found here are committed as `fix:` commits.

- [ ] **Step 1: Build and check the bundle**

Run: `python3 scripts/site.py build && python3 scripts/check.py && git diff --check && echo "BUILD OK"`
Expected: `Prepared 6 public files in …/dist`, then `BUILD OK`.

- [ ] **Step 2: Scan the bundle for private terms**

The private terms file lives outside the repository at `~/.config/mylanding/private-terms.txt` (create it from the owner's confidentiality list; never commit it).
Run: `python3 scripts/check.py --forbidden-file ~/.config/mylanding/private-terms.txt && grep -rilf ~/.config/mylanding/private-terms.txt dist/ docs/ || echo "no private terms"`
Expected: `no private terms`

- [ ] **Step 3: Start the preview**

Write `.claude/launch.json` with one configuration `site`: `runtimeExecutable` `python3`, `runtimeArgs` `["scripts/site.py", "preview", "--port", "8001"]`, `port` 8001. Append `.claude/` to `.gitignore`. Start it with the built-in browser's `preview_start` (name `site`).
Expected: page renders at `http://127.0.0.1:8001/` with no console errors.

- [ ] **Step 4: Viewport review**

For widths 360, 390, 768 and 1280 (built-in browser `resize_window`): screenshot the top of page and the proof band; check `document.documentElement.scrollWidth <= window.innerWidth`; at 360 confirm the trust strip is one item per line with no leading dots and the proof band is two by two.
Expected: no horizontal overflow at any width; screenshots saved to the scratchpad and sent to the owner.

- [ ] **Step 5: Keyboard and contrast**

In the browser: press Tab from the top; the skip link appears first and lands on `main`; every link and button shows a focus outline in order. Run a contrast script over every text node's computed colour against its background; minimum ratio must be ≥ 4.5.
Expected: focus order follows the page; minimum contrast reported ≥ 4.5.

- [ ] **Step 6: Links**

Run: `python3 -c "import sys; sys.path.insert(0,'scripts'); import check; f=check.parse_page(open('index.html').read()); print(sorted(set(h for h in f.hrefs if h.startswith(('http','mailto')))))"`
Expected: exactly the seven destinations from Global Constraints. Clicking the booking button in the preview opens a mail draft; nothing is sent.

- [ ] **Step 7: Commit any fixes and report**

```bash
git add -A -- index.html styles.css llms.txt README.md scripts/check.py .gitignore
git commit -m "fix: verification follow-ups"   # only if there were changes
```

Report to the owner: commit list, screenshots, the check output, and the limits (email delivery, production analytics and post-deploy behaviour untested). Ask for publication approval; do not push or open a pull request into `main` without it.
