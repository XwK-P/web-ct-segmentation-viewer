# Repository Guidelines

## Project Structure & Module Organization
The app is a Vite + React 19 + TypeScript frontend for local CT/NIfTI viewing. Main source lives in `src/`: `App.tsx` contains most viewer logic and UI state, `main.tsx` bootstraps React, and `index.css` imports Tailwind CSS v4. Static HTML entry points are at the repo root (`index.html`), build output goes to `dist/`, and project screenshots/docs live in `docs/`. Environment examples are in `.env.example`; keep secrets and local data out of git.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server on `http://localhost:3000`.
- `npm run build`: create a production bundle in `dist/`.
- `npm run preview`: serve the production build locally for verification.
- `npm run lint`: run `tsc --noEmit`; this is the project’s current CI-style correctness check.
- `npm run clean`: remove `dist/`.

## Coding Style & Naming Conventions
Use TypeScript with React function components. Follow the existing style: 2-space indentation, semicolons, and single quotes. Name components and type aliases in `PascalCase`, hooks and helpers in `camelCase`, and keep domain-specific types explicit (`CaseData`, `LabelData`, etc.). Keep UI logic near the viewer unless a new module clearly improves readability. Tailwind utility classes are preferred for styling; use `src/index.css` only for global setup.

## Testing Guidelines
There is no automated test suite yet. Until one is added, every change should pass `npm run lint` and `npm run build`, then be manually exercised in the browser with representative local image and label folders. For UI changes, verify core flows: folder selection, case loading, label toggles, view switching, and screenshot export. If you add tests, place them near the code they cover and use `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit prefixes such as `feat:`, `perf:`, and `docs:`. Keep commit subjects short, imperative, and scoped to one change. Pull requests should include a concise summary, validation steps run locally, and screenshots for any visible UI update. Link related issues when applicable, and never commit patient data, large scan files, or populated `.env` files.

## Security & Configuration Tips
This project is designed for offline/local data handling. Use `.env.example` as the template for local config, and treat any API keys or medical images as sensitive. Share only de-identified sample data.
