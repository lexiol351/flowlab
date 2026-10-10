# FlowLab — Visual Workflow Builder

A fully functional, **local-first** visual workflow automation editor inspired by
n8n and Node-RED — with a **real workflow execution engine**, not a mockup.

**Live demo:** https://lexiol351.github.io/flowlab/

![FlowLab editor](docs/screenshots/editor-dark.png)

## Features

- **Visual node editor** — drag nodes from the palette, connect typed ports,
  move/select/duplicate/delete, zoom/pan/fit, minimap, grid snapping.
- **Real execution engine** — topological ordering, cycle detection, typed port
  validation, conditional branching, multi-input gating, per-node status,
  ordered execution log, abort/reset. Independent of React; fully unit-tested.
- **7 functional node types** — Text/Number Input, Text Transform, Math
  Transform, Condition (branching), Merge Text, Output.
- **Validated connections** — incompatible types can't connect (by drag *or*
  via the accessible Connect dialog); would-be cycles are rejected up front.
- **Undo/redo** with keyboard shortcuts.
- **Persistence** — autosave to IndexedDB, multiple named workflows,
  rename/duplicate/delete, JSON export/import with runtime validation and
  corrupted-data recovery, versioned schema with tested migrations.
- **3 built-in example workflows** ready to run.
- **Dark/light themes**, responsive layout, keyboard shortcuts, toasts,
  offline indicator, reduced-motion support.
- **PWA** — installable, works fully offline after first load.

## Quick start

```bash
npm ci
npm run dev        # dev server
npm run build      # production build
npm run preview    # serve the production build
```

Open http://localhost:5173/flowlab/ (dev server respects the `/flowlab/` base).

## Scripts

| Script              | What it does                                      |
|---------------------|---------------------------------------------------|
| `npm run dev`       | Vite dev server                                   |
| `npm run build`     | Typecheck + production build                     |
| `npm run lint`      | ESLint                                            |
| `npm run typecheck` | `tsc -b`                                          |
| `npm run test`      | Vitest unit + integration tests                   |
| `npm run test:coverage` | Vitest with coverage gates (≥80% on core)    |
| `npm run test:e2e`  | Playwright E2E against the production build      |

## Testing

```bash
npm run test:coverage   # 100+ unit/integration tests, coverage thresholds enforced
npm run test:e2e        # real Chromium: create → connect → run → branch →
                        # reload → export/import → invalid-connection rejection
```

Playwright needs Chromium once: `npx playwright install chromium`.

## Keyboard shortcuts

| Shortcut               | Action                          |
|------------------------|---------------------------------|
| `Ctrl/⌘ + Z`           | Undo                            |
| `Ctrl/⌘ + Shift + Z` / `Ctrl/⌘ + Y` | Redo               |
| `Ctrl/⌘ + D`           | Duplicate selected nodes        |
| `Delete` / `Backspace` | Delete selected nodes           |
| `Ctrl/⌘ + Enter`       | Run workflow                    |
| `Esc`                  | Close dialogs / clear selection |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for module layout, engine semantics,
and key decisions. The workflow file format is documented in
[docs/workflow-schema.md](docs/workflow-schema.md).

```
src/lib/workflow/   engine, node registry, validation, history, migrations
src/lib/db/         IndexedDB persistence
src/lib/store/      Zustand store (sole bridge between UI and engine/DB)
src/components/     React UI (editor, panels, dialogs)
```

## Deployment

`main` branch → GitHub Actions **CI** (lint, typecheck, tests + coverage,
build, Playwright E2E) → on success **Deploy** builds and publishes to
GitHub Pages via the official `deploy-pages` action, then verifies HTTP 200.
Version tags (`v*`) trigger the **Release** workflow, which attaches a ZIP of
the production build to a GitHub Release.

## Tech stack

React 19 · TypeScript (strict) · Vite · @xyflow/react · Zustand · Zod ·
IndexedDB · Vitest · Playwright · vite-plugin-pwa · GitHub Actions · GitHub Pages

## License

MIT — see [LICENSE](LICENSE).
