# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (starts on port 3000, bound to 0.0.0.0)
- **Build:** `npm run build` (outputs to `dist/`)
- **Lint/typecheck:** `npm run lint` (runs `tsc --noEmit`)
- **Clean:** `npm run clean`
- **No test runner is configured.**

## Architecture

This is a fully client-side React application for viewing CT scans (NIfTI files) with segmentation overlays. No data leaves the browser. Scaffolded from Google AI Studio.

**Core rendering** uses [Niivue](https://github.com/niivue/niivue) (`@niivue/niivue`), a WebGL 2.0 medical image viewer. The entire app lives in a single component at `src/App.tsx` — there are no sub-components, routers, or state management libraries.

**Key data flow:**
1. User selects local folders via HTML5 File API (`webkitdirectory`)
2. Files are matched by naming convention: images are `{CASE_ID}.nii.gz`, labels are `{CASE_ID}_{LABEL_NAME}.nii.gz`
3. Label-to-case matching uses longest-prefix matching against known case IDs; fallback splits on last underscore
4. Niivue renders volumes on a `<canvas>` element; overlays are loaded/removed individually via `nv.loadFromFile()` / `nv.removeVolume()`
5. The base CT volume is tagged with `name: '_base_'` to distinguish it from label overlays

**Niivue API patterns used:**
- Slice types: `nv.setSliceType(n)` — 0=Axial, 1=Coronal, 2=Sagittal, 3=Multiplanar, 4=3D Render
- Render modes: `nv.setVolumeRenderIllumination(n)` — 0=matte, 1=shiny, NaN=MIP
- Window/level: set `vol.cal_min` / `vol.cal_max` on the base volume, then `nv.updateGLVolume()`
- Custom colormaps added via `nv.addColormap()` for yellow, cyan, magenta, orange

**Stack:** React 19, Vite 6, Tailwind CSS v4 (using `@tailwindcss/vite` plugin), TypeScript 5.8, Lucide icons.

**Unused dependencies in package.json:** `express`, `better-sqlite3`, `@google/genai`, `motion` — these are not currently used in `src/` but are present from the AI Studio scaffold or planned features.

## Conventions

- Path alias: `@/` resolves to the project root (configured in both `tsconfig.json` and `vite.config.ts`)
- Tailwind v4 setup: imported via `@import "tailwindcss"` in `src/index.css`, no `tailwind.config` file
- Environment variables: `.env` file with `GEMINI_API_KEY` (exposed via `process.env.GEMINI_API_KEY` in Vite define config); see `.env.example`
- Label colormaps cycle through: red, green, blue, yellow, cyan, magenta, orange (index-based)
- `webkitdirectory` attribute uses `@ts-ignore` comments since it's non-standard
