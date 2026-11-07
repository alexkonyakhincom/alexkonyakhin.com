# alexkonyakhin.com

A static one-page website presenting Alexey Konyakhin as a Fractional CPO for founder-led software companies, based in Belgrade. HTML, CSS and a local portrait image; no framework, package installation or CMS. The approved copy and content rules live in `docs/superpowers/specs/2026-11-07-fractional-cpo-page-design.md`.

## Local preview

Requires Python 3:

```sh
python3 scripts/site.py preview
```

Open http://127.0.0.1:8000/. The command copies the public files into `dist/` and serves only that directory on the loopback interface. To use another port, add `--port 8001`.

After editing a source file, run `python3 scripts/site.py build` and reload the browser. Preview responses disable caching. Unknown paths return a 404.

## Public files

- `index.html`: homepage, social metadata and Person structured data.
- `styles.css`: responsive layout and visual styles.
- `ava_alex_konyakhin.png`: portrait and favicon.
- `llms.txt`: factual text profile matching the homepage.
- `robots.txt`: existing crawler policy.
- `CNAME`: existing custom domain.

`scripts/site.py` owns this explicit list. It refuses unexpected files in `dist/` and symlinked public files. Private briefs, source decks, reports and local output do not belong in the public output. `dist/` and `output/` are ignored by Git.

## Deployment

The GitHub Pages workflow stages the public files with `python3 scripts/site.py build`, then uploads `dist/`. The workflow still runs on pushes to `main` or a manual dispatch. Creating a branch or running a local preview does not deploy the site.

The existing GA4 measurement ID is retained. Analytics loads only on `alexkonyakhin.com` and `www.alexkonyakhin.com`, so local review does not send analytics events. The "Book a 30-minute call" buttons link to a Google Calendar appointment page; the contact section also offers Telegram and email. No form, embed or third-party script is installed.

## Checks

There is no package-based build, lint or test suite. `python3 scripts/check.py` verifies the page against the spec: required copy, retired claims, exact link destinations, in-page anchors, call-to-action attributes, metadata, structured data, the analytics gate, the AI profile and the `dist/` file set. Pass `--forbidden-file PATH` to add private terms from a file kept outside the repository.

Before deployment, run `python3 scripts/check.py`, `git diff --check` and `python3 scripts/site.py build`, then review the local page at 360, 390, 768 and 1280 pixels, at increased zoom, and with keyboard navigation. Check public assets and exact contact destinations without sending messages.
