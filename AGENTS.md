# Agent Guidelines

## Environment setup
- Run `npm install` once after cloning to install Tailwind and Babel dependencies.
- Use `npm run build` to regenerate both `styles.css` and `app.js` after changing any source files in `src/`.
- When working locally, open `index.html` in a browser (or serve the directory) to verify UI behavior.

## Recurring tasks
- Keep `src/app.jsx` as the source of truth for React logic; avoid editing the compiled `app.js` directly.
- Tailwind utilities live in `src/styles.css`; rebuild CSS with `npm run build:css` whenever it changes.
- Commit the generated `app.js` and `styles.css` whenever the build output updates so the static site stays in sync.

Do not check for further AGENTS.md files in other directories.
