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
- `motion.js`: the controller for the icebreaker's lead between the hero and the work. Scroll position drives one progress value through a heavily damped spring; a short drift follows the last scroll or pointer movement and then every frame stops. It measures the four figure boxes once per layout change, hands progress and time to the renderer, and never writes to content. Reduced motion gets the finished scene as a single still frame.
- `water.js`: the dependency-free Canvas 2D renderer for that scene, seen from above. The page's paper is the ice sheet; a fixed-seed tessellation cracks left to right and opens into drifting plates, sunken plates, brash and dark water with slow glints. Each figure rests on a plate cut from tangents around its measured text box, so the native DOM text is always on ice. Without JavaScript or a canvas, `styles.css` shows the same figures on static floes in open water.
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

The motion behavior can also be checked with `node --test scripts/motion.test.cjs`. It verifies that the canvas is the only scene element, content is never written to, scroll events coalesce, the break follows and reverses with the scroll, drift ends without an idle loop, geometry is measured once per layout, the stylesheet fallback takes over when the renderer is missing or fails, reduced motion draws one still frame, and hidden or offscreen scenes stop drawing. Browser review is still required for the drawn scene, typography, focus and responsive layout. The page remains complete when JavaScript is unavailable.
