# Serbian Page and Language Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Serbian page at `/sr/` with a header language switch, keep both pages in step through the check script, and ship it through a pull request.

**Architecture:** A second static page `sr/index.html` shares `styles.css` and the portrait. `scripts/site.py` stages it into `dist/sr/`. `scripts/check.py` runs every page check over both pages with per-language copy and adds parity and alternate-link checks. The English page gains the switch, the alternate links, an Open Graph locale and a `lang` parameter on the click event.

**Tech Stack:** HTML, CSS, Python 3 standard library.

**Spec:** `docs/superpowers/specs/2026-11-07-serbian-page-design.md` (which extends `docs/superpowers/specs/2026-11-07-fractional-cpo-page-design.md`).

## Global Constraints

- Serbian copy is spec §3 verbatim, Latin script, formal "vi", Serbian number formats (`20.000`, `2,15×`). English copy is unchanged.
- The only English-page changes: switch link, three alternate links, `og:locale` "en_GB", `lang` parameter on `cta_click`.
- Exact destinations as in the homepage plan plus the internal `/` and `/sr/`. Every local asset reference starts with `/`.
- `<html lang="sr-Latn">` on the Serbian page; `lang="en"` stays on the English page.
- Alternates on both pages, exactly: `en` → `https://alexkonyakhin.com/`, `sr-Latn` → `https://alexkonyakhin.com/sr/`, `x-default` → `https://alexkonyakhin.com/`.
- Switch: English page `<a href="/sr/" lang="sr-Latn" hreflang="sr-Latn">Srpski</a>`; Serbian page `<a href="/" lang="en" hreflang="en">English</a>`; last link in the header nav.
- Public bundle becomes exactly seven files: the six existing plus `sr/index.html`.
- Same section ids on both pages: `main`, `hero-title`, `work`, `how-i-work`, `background`, `contact` and the heading ids used by `aria-labelledby`.
- Branch `feature/serbian-page`; nothing pushed to `main`; no PR into `main` without explicit confirmation.

## Review Focus

1. A stylesheet or portrait referenced by a relative path breaks only under `/sr/`. Test: Task 2 `check_assets` asserts every local `href`/`src` on both pages starts with `/`.
2. The switch on one page points at itself or carries the wrong label. Test: Task 2 `check_switch` asserts href, `hreflang` and link text per page.
3. Alternate links missing `x-default` or pointing at the wrong page quietly break language targeting in search. Test: Task 2 `check_alternates` asserts the exact three pairs on both pages.
4. Diacritics corrupted by encoding or entity handling show as mojibake. Test: Task 2's Serbian required strings include `Preskoči`, `Zakažite`, `osnivači`, `zapošljavanja`, `štampe`; Task 5 reads them in the browser.
5. `dist/sr/` not created or not uploaded gives a 404 on the live `/sr/`. Test: Task 1 build assertion on `dist/sr/index.html`; Task 5 checks the live route after publication.

---

### Task 1: Build script stages a nested public file

**Files:**
- Modify: `scripts/site.py` (`PUBLIC_FILES`, `build()`)
- Create: `sr/index.html` (temporary stub, replaced in Task 3)

**Interfaces:**
- Produces: `PUBLIC_FILES` includes `"sr/index.html"`; `build()` creates parent folders in `dist/`, refuses unexpected files anywhere under `dist/`, and refuses symlinked folders.

- [ ] **Step 1: Write the stub and the failing build**

Create `sr/index.html` containing `<!DOCTYPE html><html lang="sr-Latn"><head><meta charset="UTF-8"><title>stub</title></head><body><h1>stub</h1></body></html>`. Add `"sr/index.html"` to `PUBLIC_FILES`.

- [ ] **Step 2: Run the build to verify it fails**

Run: `python3 scripts/site.py build`
Expected: a traceback ending in `FileNotFoundError` for `dist/sr/index.html` (the folder is not created).

- [ ] **Step 3: Make `build()` handle nested paths**

In `build()`: compute `expected = set(PUBLIC_FILES)`; collect `actual = {p.relative_to(OUTPUT).as_posix() for p in OUTPUT.rglob("*") if p.is_file()}`; raise on `actual - expected` as before; for each name, `destination.parent.mkdir(parents=True, exist_ok=True)` before copying; extend the symlink check to every parent folder of a destination inside `OUTPUT`.

- [ ] **Step 4: Run the build and prove the guard**

Run: `python3 scripts/site.py build && test -f dist/sr/index.html && echo "nested ok" && touch dist/sr/stray.txt && (python3 scripts/site.py build; echo "guard exit: $?") ; rm -f dist/sr/stray.txt`
Expected: `Prepared 7 public files`, `nested ok`, then the stray file makes the second build print `Unexpected files in dist ... sr/stray.txt` with `guard exit: 1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/site.py sr/index.html
git commit -m "Build: stage sr/index.html into dist/sr with the unexpected-files guard covering subfolders"
```

---

### Task 2: Check script covers both pages

**Files:**
- Modify: `scripts/check.py`

**Interfaces:**
- Consumes: Task 1's `PUBLIC_FILES`.
- Produces: `PAGES: dict[str, PageSpec]` keyed by path (`"index.html"`, `"sr/index.html"`) with fields `lang`, `title`, `description`, `og_locale`, `required`, `switch_href`, `switch_lang`, `switch_text`; `PageFacts` gains `alternates: list[tuple[str, str]]` (hreflang, href), `switches: list[tuple[str, str, str, str]]` (href, lang, hreflang, text), `og_locale: str`, `heading_counts: dict[str, int]`, `local_assets: list[str]` (every `href`/`src` whose value does not start with `http`, `mailto:`, `#` or `data:`); new checks `check_assets(facts)`, `check_switch(facts, spec)`, `check_alternates(facts)`, `check_parity(en, sr)`; `check_structure(facts, lang)` and `check_meta(facts, spec)` take the expected values, and `check_meta` also asserts `facts.og_locale == spec.og_locale`; every per-page failure line is prefixed with the page path (`FAIL: sr/index.html: missing text: …`) and parity failures with `FAIL: parity:`; `check_hrefs` allows `/` and `/sr/`; `check_analytics(html)` also asserts the literal `lang: document.documentElement.lang.split('-')[0]`; `check_dist()` compares the relative file tree with `PUBLIC_FILES`.

- [ ] **Step 1: Add the Serbian page spec and the new checks**

`REQUIRED_HTML_SR`: every string of spec §3.1–3.9 verbatim, using the homepage plan's conventions (proof tiles as "numeral label", timeline rows as "years role", case results as parts). `TITLE_SR` and `DESCRIPTION_SR` from spec §5.
`check_alternates`: `set(facts.alternates) == {("en", "https://alexkonyakhin.com/"), ("sr-Latn", "https://alexkonyakhin.com/sr/"), ("x-default", "https://alexkonyakhin.com/")}`.
`check_switch`: exactly one switch; its href, hreflang and text equal the spec's values; its `lang` equals its `hreflang`.
`check_assets`: every local asset starts with `/`.
`check_parity`: `set(en.ids) == set(sr.ids)`; `en.heading_counts == sr.heading_counts`; `{(c, l) for c, l, _ in en.ctas} == {(c, l) for c, l, _ in sr.ctas}`; `sorted(external(en.hrefs)) == sorted(external(sr.hrefs))`.
`main`: loop over `PAGES`; run per-page checks with each page's spec, prefixing each failure with the page path; then `check_parity`; `check_sources_forbidden` over both pages, `styles.css` and `llms.txt`; `check_dist` compares `{relative posix paths of files under dist/}` with `set(PUBLIC_FILES)`.

- [ ] **Step 2: Run to verify the Serbian checks fail on the stub**

Run: `python3 scripts/check.py | grep -c "sr/index.html"`
Expected: a count of at least 40 (missing Serbian copy, missing alternates, missing switch, title, description, structured data, analytics).

- [ ] **Step 3: Verify the English page now fails for the new requirements only**

Run: `python3 scripts/check.py | grep "index.html:" | grep -v "sr/index.html"`
Expected: lines for `alternates`, `switch`, `og:locale` and `analytics: lang` on `index.html`, nothing else.

- [ ] **Step 4: Commit**

```bash
git add scripts/check.py
git commit -m "Check: run every page check over both pages; add alternate, switch, asset-path and parity checks"
```

---

### Task 3: The Serbian page, the English page's additions, and the switch style

**Files:**
- Modify: `sr/index.html` (full page replacing the stub)
- Modify: `index.html` (head: alternates, `og:locale`, analytics `lang`; nav: switch)
- Modify: `styles.css` (`.lang-switch`)

**Interfaces:**
- Consumes: Task 2 checks.
- Produces: both pages pass `python3 scripts/check.py`.

- [ ] **Step 1: English page additions**

In `<head>` after the canonical link: the three alternate links from spec §5 and `<meta property="og:locale" content="en_GB">`. In the analytics tracker: `gtag('event', 'cta_click', { cta: cta, location: location, lang: document.documentElement.lang.split('-')[0] });`. In the nav, last: `<a class="lang-switch" href="/sr/" lang="sr-Latn" hreflang="sr-Latn">Srpski</a>`.
CSS: `.lang-switch { margin-left: var(--space-3); padding-left: var(--space-4); border-left: 1px solid var(--line); }`; inside the 700px media query the border and padding stay (the nav wraps as a row already).

- [ ] **Step 2: Run to verify the English page passes and only the Serbian page fails**

Run: `python3 scripts/check.py | grep FAIL | grep -v -e "sr/index.html" -e "parity" || echo "english clean"`
Expected: `english clean`

- [ ] **Step 3: Write `sr/index.html`**

Copy `index.html` and translate every visible string and attribute text per spec §3, keeping every id, class, `data-cta`, `data-cta-location` and href. Head per spec §5: `lang="sr-Latn"`, title, description, canonical `https://alexkonyakhin.com/sr/`, `og:url` the canonical, `og:title` the H1, `og:description` the subhead, `og:locale` "sr_RS", the same three alternates, the same analytics script, the Person JSON-LD with the Serbian description. Nav last: `<a class="lang-switch" href="/" lang="en" hreflang="en">English</a>`. Serbian number formats in the proof band and case results. The learning-game, recruitment and analytics blocks keep their `h4` leads.

- [ ] **Step 4: Run the full check**

Run: `python3 scripts/check.py --forbidden-file ~/.config/mylanding/private-terms.txt && echo "ALL CHECKS PASS"`
Expected: `ALL CHECKS PASS`

- [ ] **Step 5: Commit**

```bash
git add sr/index.html index.html styles.css
git commit -m "Serbian page at /sr/ with header language switch; alternates, locale and lang analytics on both pages"
```

---

### Task 4: Profile and README

**Files:**
- Modify: `llms.txt`, `README.md`, `scripts/check.py` (`REQUIRED_LLMS`)

- [ ] **Step 1: Add the profile check**

Append `"https://alexkonyakhin.com/sr/"` to `REQUIRED_LLMS`.

- [ ] **Step 2: Run to verify it fails**

Run: `python3 scripts/check.py | grep "llms.txt missing"`
Expected: `FAIL: llms.txt missing: https://alexkonyakhin.com/sr/`

- [ ] **Step 3: Update the files**

`llms.txt` Contact section gains `- Serbian version: https://alexkonyakhin.com/sr/`. README: the public-files list gains `sr/index.html`; a short "Two languages" paragraph says the Serbian page is a hand-maintained translation, copy changes are made on both pages, and `scripts/check.py` enforces parity and the alternate links.

- [ ] **Step 4: Run the full check**

Run: `python3 scripts/check.py && echo "ALL CHECKS PASS"`
Expected: `ALL CHECKS PASS`

- [ ] **Step 5: Commit**

```bash
git add llms.txt README.md scripts/check.py
git commit -m "Profile and README: Serbian page"
```

---

### Task 5: Build, browser verification and pull request

**Files:** none expected; fixes are `fix:` commits.

- [ ] **Step 1: Build and scan**

Run: `python3 scripts/site.py build && python3 scripts/check.py --forbidden-file ~/.config/mylanding/private-terms.txt && git diff --check && find dist -type f | sort && (grep -rilf ~/.config/mylanding/private-terms.txt dist/ docs/ sr/ index.html || echo "no private terms")`
Expected: `Prepared 7 public files`, `OK: all checks passed`, seven paths listed including `dist/sr/index.html`, `no private terms`.

- [ ] **Step 2: Preview**

Start `python3 scripts/site.py preview --port 8002` in the background and open `http://127.0.0.1:8002/sr/` in the built-in browser.
Expected: title "Alexey Konyakhin · Fractional CPO · Beograd", no console errors.

- [ ] **Step 3: Serbian page at 1280 and 360px**

Check: `scrollWidth <= innerWidth`; the trust strip is two columns at 1280 and one at 360; H1 line count noted; the strings `Preskoči na sadržaj`, `Zakažite razgovor od 30 minuta`, `osnivači` are present in `document.body.innerText`; clicking "English" lands on `/`, and clicking "Srpski" there lands on `/sr/`.
Expected: no overflow at either width; switch round-trips.

- [ ] **Step 4: English page at 1280 and 360px**

Check: no overflow; the switch is the last nav item and shows "Srpski"; Tab order reaches the switch after "Background".
Expected: as stated.

- [ ] **Step 5: Push and open the pull request**

```bash
git push -u origin feature/serbian-page
gh pr create --repo alexkonyakhincom/alexkonyakhin.com --base main --head feature/serbian-page --title "Serbian page at /sr/ with a header language switch" --body-file <body>
```

Body: what changed, why, verification, the three open items and their fallbacks, and "merging publishes". Report the URL. Do not merge without the owner's explicit approval; after approval, watch the deploy run and check `https://alexkonyakhin.com/sr/` returns 200 and `https://alexkonyakhin.com/sr` redirects or returns 200.
