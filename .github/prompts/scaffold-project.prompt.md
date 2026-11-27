---
description: One-time project scaffold (Vite + React + TS + tooling) for Localedger
agent: agent
---

Scaffold the Localedger project in the current workspace folder (do not create a nested folder). First read `.github/copilot-instructions.md` and `docs/architecture.md`.

Do exactly this, then stop:

1. Initialize a Vite + React + TypeScript project in place (keep the existing `.github/`, `.vscode/`, `docs/` files untouched).
2. Install: react-router-dom, dexie, dexie-react-hooks, zod, date-fns, lucide-react, tailwindcss (with its Vite plugin), vite-plugin-pwa, and dev dependencies: vitest, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, jsdom, fake-indexeddb, eslint (+ typescript-eslint, react-hooks plugin), prettier.
3. Configure: TypeScript `strict` plus `noUncheckedIndexedAccess`, the `@/` alias to `src/`, Vite `base` set via an env variable so it works on GitHub Pages (`/localedger/` by default), Vitest with jsdom and a setup file, ESLint, Prettier.
4. Add npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:watch`, `format`.
5. Create the empty folder structure from `docs/architecture.md` with minimal placeholder files only where needed for the app to run: `HashRouter`, an app shell with bottom navigation (Home, Transactions, Scheduled, Accounts, More), and placeholder pages.
6. Add a GitHub Actions workflow `.github/workflows/deploy.yml` that runs typecheck, lint, test and build on PRs, and deploys `dist/` to GitHub Pages on pushes to `main`.
7. Add a minimal `README.md` (what Localedger is, how to run, and a placeholder section "Google Drive setup (coming)").
8. Run `npm run typecheck && npm run lint && npm run test && npm run build` and fix any failures.

Report what you created, any versions you had to choose, and anything I should verify. Do not implement any feature code.
