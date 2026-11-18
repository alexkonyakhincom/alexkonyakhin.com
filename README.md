# alexkonyakhin.com

A static one-page website presenting Alexey Konyakhin as a Fractional CPO for founder-led software companies, based in Belgrade. HTML, CSS, a local portrait image and a self-hosted typeface; no framework, package installation or CMS. The approved copy and content rules live in `docs/superpowers/specs/2026-11-07-fractional-cpo-page-design.md`.

## Local preview

Requires Python 3:

```sh
python3 scripts/site.py preview
```

Open http://127.0.0.1:8000/. The command copies the public files into `dist/` and serves only that directory on the loopback interface. To use another port, add `--port 8001`.

After editing a source file, run `python3 scripts/site.py build` and reload the browser. Preview responses disable caching. Unknown paths return a 404.

## Public files

- `index.html`: homepage, social metadata and Person structured data.
- `sr/index.html`: the Serbian homepage, served at `/sr/`.
- `styles.css`: responsive layout, typography and interaction states.
- `motion.js` maps scroll position to the fracture in the ice behind the proof figures. The scene holds its position when scrolling stops and retraces the same fracture when scrolling back. The controller measures the figure boxes once per layout change. Reduced motion shows the finished scene as a still image.
- `water.js` draws the ice in Canvas 2D. A fixed-seed pattern cracks from left to right into a muted grey-green channel, with fewer fragments on narrow screens. Each figure's plate fits its measured text box. The figures are native HTML. When JavaScript or canvas is unavailable, `styles.css` supplies static floes.
- `ava_alex_konyakhin.png`: square header avatar and favicon.
- `portrait.jpg`: the larger portrait in the Background section and the link-preview image.
- `fonts/`: Instrument Sans variable fonts (Latin and Latin Extended subsets), with `instrument-sans-OFL.txt`. The same family handles headings and body text. Self-hosted so the page loads nothing from a font service.
- `llms.txt`: factual text profile matching the homepage.
- `robots.txt`: existing crawler policy.
- `CNAME`: existing custom domain.

## Two languages

The Serbian page is a hand-maintained translation of the English page (Latin script, four lines adapted for local buyers; see the Serbian page spec in `docs/superpowers/specs/`). A copy change is made on both pages. `scripts/check.py` enforces parity between them (same ids, headings, calls to action and destinations) and the alternate-language links on both.

`scripts/site.py` owns this explicit list. It refuses unexpected files in `dist/` and symlinked public files. Private briefs, source decks, reports and local output do not belong in the public output. `dist/` and `output/` are ignored by Git.

## Deployment

The GitHub Pages workflow stages the public files with `python3 scripts/site.py build`, then uploads `dist/`. The workflow still runs on pushes to `main` or a manual dispatch. Creating a branch or running a local preview does not deploy the site.

The existing GA4 measurement ID is retained. Analytics loads only on `alexkonyakhin.com` and `www.alexkonyakhin.com`, so local review does not send analytics events. The "Book a 30-minute call" buttons link to a Google Calendar appointment page; the contact section also offers Telegram and email. No form, embed or third-party script is installed.

## Checks

There is no package-based build, lint or test suite. `python3 scripts/check.py` verifies the page against the spec: required copy, retired claims, exact link destinations, in-page anchors, call-to-action attributes, metadata, structured data, the analytics gate, the AI profile, that every local file the pages or `styles.css` reference is published, and the `dist/` file set. Pass `--forbidden-file PATH` to add private terms from a file kept outside the repository.

Before deployment, run `python3 scripts/check.py`, `git diff --check` and `python3 scripts/site.py build`, then review the local page at 360, 390, 768 and 1280 pixels, at increased zoom, and with keyboard navigation. Check public assets and exact contact destinations without sending messages.

Run `node --test scripts/motion.test.cjs` to check scroll tracking, reversal, idle and pointer behavior, layout measurement, the stylesheet fallback, reduced motion and offscreen rendering. Browser review covers the drawn scene, typography, focus and responsive layout.
