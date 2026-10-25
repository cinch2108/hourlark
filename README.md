# Hourlark: free online timer & time tools

Static site, no build step needed to serve, no backend, no accounts. Everything runs in the browser and is saved only in the visitor's local storage.

**Tools (one crawlable page each):** Online Timer (`/`), Stopwatch (`/stopwatch/`), Pomodoro Timer (`/pomodoro-timer/`), Countdown to a date (`/countdown/`), World Clock (`/world-clock/`), Time Zone Converter & Meeting Planner (`/time-zone-converter/`), Alarm Clock (`/alarm-clock/`).

Tabs are real links (crawlable, work without JS), but when JS is on the app swaps pages in place, so running timers, Pomodoro sessions and alarms keep going while you move between tools.

## Files
- `template.html`: the single source page. **Edit this, never the generated `index.html` files.**
- `build_pages.py`: generates `index.html` + 6 tool folders (title, description, canonical, OG/Twitter tags, H1, lead, How-to, 4 FAQs, FAQPage + BreadcrumbList JSON-LD, cross-links) and `sitemap.xml`. Run `python3 build_pages.py` after any change to the template or page copy.
- `app.js`: pure logic module (`TK`, also exported for Node tests) + browser UI. No inline scripts or handlers; strict-CSP friendly. All sounds are synthesized with Web Audio (no audio files).
- `styles.css`, `privacy.html`, `terms.html`, `_headers`, `robots.txt`, `sitemap.xml`, `ads.txt`.

## How timing works
Every timer, Pomodoro session and alarm stores an absolute end timestamp. `requestAnimationFrame` only paints; a 250 ms interval plus an exact `setTimeout` to the next deadline decide when things ring, so background-tab throttling can't make them drift. Ringing is scheduled ahead on the Web Audio clock so it keeps sounding in background tabs. Time zones use `Intl.DateTimeFormat` (the browser's IANA database), so DST is correct for any date.

## Local preview
from the parent of a folder named `hourlark` containing this repo: `python3 -m http.server 8000` then open http://localhost:8000/hourlark/ (mirrors the Pages sub-path) (in-place tab switching uses fetch, so use http rather than file://; on file:// tabs just do normal page loads).

## Tests
From the parent folder: `node timekit-test.js` (109 logic checks) and `node --experimental-websocket timekit-ui-test.js` (148 checks in real headless Chrome over CDP, real time; needs `google-chrome` and `python3 -m http.server 8765` running inside `timekit/`; to test the GitHub Pages sub-path, serve a parent folder containing `hourlark/` and run with `BASE=http://localhost:PORT/hourlark/`).

## GitHub Pages (https://cinch2108.github.io/hourlark/)
This folder is the repo root for the `hourlark` repo under `cinch2108` (Settings → Pages → Deploy from branch `main`, folder `/`). It is served from the `/hourlark/` sub-path, so:
- All internal links and assets are relative (`styles.css`, `../stopwatch/`, `./`). Never add root-absolute links like `href="/..."`; they would point at `cinch2108.github.io/` instead of the site.
- The base URL `https://cinch2108.github.io/hourlark` is set in `DOMAIN` at the top of `build_pages.py` (canonical, og:url, JSON-LD, sitemap) plus `template.html`, `robots.txt`, `privacy.html`, `terms.html`. To move to a custom domain later, change it there, run `python3 build_pages.py`, and add a `CNAME` file.
- `404.html` is served by Pages for any missing URL at any depth, so it uses `<base href="/hourlark/">` (the one intentional root-relative path) to keep its CSS and links working. If the repo is renamed, update that line.
- `.nojekyll` is present so Pages serves files as-is (no Jekyll processing).
- `robots.txt` here is informational only: crawlers read robots.txt only at the domain root (`cinch2108.github.io/robots.txt`). Submit the sitemap directly in Search Console (URL-prefix property `https://cinch2108.github.io/hourlark/`).
- All three sites share the `cinch2108.github.io` origin, so local storage is shared between them; this site's keys are all prefixed (`hl.*`) so nothing collides.

### Headers GitHub Pages can't set
GitHub Pages ignores `_headers` (kept only for a future move to Netlify/Cloudflare Pages). What is covered instead:
- **Content-Security-Policy** and **Referrer-Policy**: set as `<meta>` tags on every page (tool pages, privacy, terms, 404).
- **frame-ancestors** (CSP, not allowed in a meta tag) and **X-Frame-Options**: cannot be set. `app.js` starts with a frame-buster that breaks out of (or blanks the page inside) any frame from another origin. Privacy, terms and 404 have no JS and nothing interactive, so they aren't covered.
- **Strict-Transport-Security**: can't be set by you, but github.io is HSTS-preloaded and Pages enforces HTTPS (tick "Enforce HTTPS" if you add a custom domain).
- **X-Content-Type-Options**, **Permissions-Policy**, **Cross-Origin-Opener-Policy**: cannot be set on Pages (not valid as meta tags).

### Contact email
The privacy and terms pages use the placeholder **contact@example.com**. Change it to a real address you read before launch: `grep -rl contact@example.com .`

## Launch checklist
1. [x] Base URL set to `https://cinch2108.github.io/hourlark` (see GitHub Pages above).
2. [ ] Replace the placeholder `contact@example.com` in `privacy.html` and `terms.html` with a real address.
3. [ ] Create the `cinch2108/hourlark` repo, push this folder as the root, enable Pages (branch `main`, `/`), and check https://cinch2108.github.io/hourlark/ and a random missing URL (should show the 404 page).
4. [ ] Apply to AdSense (or another network). Put your publisher line in `ads.txt`.
5. [ ] Paste ad units into the four `data-ad-slot` containers in `template.html` (top 970x90, rail 300x250 ×2 sticky, footer 728x90) and rebuild.
6. [ ] Add the ad network domains to the CSP in the `<meta http-equiv="Content-Security-Policy">` in `template.html` (and `_headers` if you ever move hosts) (script-src, img-src, frame-src, connect-src). For EU/UK traffic use a Google-certified CMP or wire the banner's choice (`localStorage['hl.consent']`, value `"granted"`/`"denied"`) to Consent Mode.
7. [ ] Make a 1200x630 `og.png` and add `og:image` / `twitter:image` tags to `template.html`.
8. [ ] Submit `https://cinch2108.github.io/hourlark/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
9. [ ] Test on a phone (iOS Safari: sound needs one tap first; alarms need the tab in front) and in Lighthouse (aim for 95+).

## Limits (by design)
12 timers (max 99:59:59 each) · 999 laps · 50 Pomodoro tasks (120 chars) · 30 days of session history · 24 world clocks · 12 converter zones · 30 alarms (labels 40 chars) · countdown names 80 chars, years 1900–2300 · share-link query strings are truncated (1,000 / 2,000 chars) and every parameter is validated.
