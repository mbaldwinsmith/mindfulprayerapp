# Mindfulness & Prayer Tracker
A zero-backend PWA for tracking prayer, mindfulness, and self-compassion practices.

## Quick start (GitHub Pages)
1. Create a public repo on GitHub, e.g. `zc-tracker`.
2. Add these files at the **repo root**: `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `.nojekyll`.
3. Commit & push.
4. In **Settings → Pages**, set **Build and deployment**: Source = **Deploy from a branch**, Branch = **main** (or `master`), folder = **/** (root).
5. Wait for deployment, then open the Pages URL. You can **Add to Home Screen** on mobile to install it.

## Local testing
- Just double-click `index.html` to open it in a browser.
- Service workers require `https:` or `localhost`. GitHub Pages is HTTPS by default.

## Privacy
All data is stored **locally in your browser** (localStorage). Use **Export JSON/CSV** to back up.

## Notes
- If you use a custom domain, add a `CNAME` file with your domain.
- To update the app, push new commits; the service worker will refresh the cache automatically.


## Icons
This build uses custom brushstroke cross-in-enso icons for both 192×192 and 512×512 sizes.


## Live App
You can try the app here: [Mindfulness & Prayer Tracker on GitHub Pages](https://mbaldwinsmith.github.io/mindfulprayerapp/)
