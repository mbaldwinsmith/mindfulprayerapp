# Catholic Mindfulness and Prayer tracker

A zero-backend Progressive Web App (PWA) for cultivating prayer, mindfulness, and self-compassion habits. The tracker runs entirely in the browser, so you can use it anywhere without managing servers or databases.

## Features

- **Guided daily check-ins** for morning, midday, and evening rhythms including consecration, stillness, examen, rosary decades, and more.
- **Progress metrics** with quick totals for breath meditation minutes, Jesus Prayer counts, victories over temptations, and other customisable stats.
- **Weekly anchors** to remember Mass, confession, fasting, and accountability commitments.
- **Secure-by-default storage** that never leaves the device—perfect for private journaling and sensitive reflections.
- **Offline-first experience** powered by a service worker so the app works even without a connection.

## Quick start (GitHub Pages)

1. Create a public repository on GitHub, e.g. `zc-tracker`.
2. Copy these files into the **repository root**: `index.html`, `manifest.json`, `sw.js`, `app.js`, `styles.css`, `icon-192.png`, `icon-512.png`, and `.nojekyll`.
3. Commit and push your changes.
4. In **Settings → Pages**, set **Build and deployment** → Source to **Deploy from a branch**. Choose the `main` (or `master`) branch and the **/** (root) folder.
5. Wait for deployment, then open your GitHub Pages URL. On mobile you can **Add to Home Screen** to install the PWA.

### Updating a live deployment

Deployments are static, so simply push new commits to the published branch. The service worker will refresh caches automatically the next time the app loads.

## Local development

1. Install dependencies (needed for Tailwind and Babel builds):
   ```bash
   npm install
   ```
2. Build the production assets:
   ```bash
   npm run build
   ```
3. Open `index.html` directly in your browser (double-click or drag into a tab).

> **Note:** Service workers only work on `https://` or `http://localhost`. Opening the file locally is fine for testing UI and functionality, but background sync/cache features will be limited until served from a local dev server or GitHub Pages.

When editing source files:

- Update React code in `src/app.jsx` and rebuild with `npm run build:js`.
- Adjust Tailwind styles in `src/styles.css` and rebuild with `npm run build:css`.
- The compiled `app.js` and `styles.css` files at the project root are what the static site uses.

## Data privacy

All practice data lives **entirely in the browser** using `localStorage`. Use the in-app **Export JSON/CSV** actions to create manual backups or transfer data to another device.

## Deployment notes

- Using a custom domain? Add a `CNAME` file with the domain name before pushing.
- If you change the icons, replace both `icon-192.png` and `icon-512.png`, then update the references in `manifest.json` if sizes change.

## Technology

- **React** for stateful UI interactions (`src/app.jsx`).
- **Tailwind CSS** for utility-first styling compiled to `styles.css`.
- **Service worker & Web App Manifest** for installability and offline support.

## Live app

Try the production deployment here: [Catholic Mindfulness and Prayer tracker on GitHub Pages](https://mbaldwinsmith.github.io/mindfulprayerapp/).
