# FlowLab Architecture

FlowLab is a local-first visual workflow automation editor. There is no
backend: the React UI, the execution engine, and persistence all run in the
browser. The production build is a static site deployed to GitHub Pages.

## Module layout

```
src/
  main.tsx                    App entry: store bootstrap, PWA registration,
                              online/offline listeners
  App.tsx                     Layout shell (toolbar, palette, canvas, panels)
  components/
    layout/                   Toolbar
    palette/                  Node palette (search, drag, click-to-add)
    editor/                   React Flow canvas + custom node cards
    panels/                   Properties panel, execution log panel
    workflows/                Workflows manager dialog
    dialogs/                  Connect dialog (no-drag connections), confirm dialog
    ui/                       Toasts, offline/update indicators, shortcuts help
  lib/
    workflow/
      types.ts                Workflow JSON schema (v1) + Zod schemas
      nodeRegistry.ts         Node definitions: ports, config, execute()
      engine.ts               Validation, topo sort, cycle detection, executor
      history.ts              Undo/redo (pure functions)
      migrations.ts           Schema migrations + JSON import/export
      examples.ts             Three built-in example workflows
      reactflow.ts            Adapter between engine graphs and React Flow state
    db/
      indexeddb.ts            Promise-based IndexedDB persistence
    store/
      useFlowStore.ts         Zustand store: the single bridge between UI
                              and the engine/persistence layers
  styles/                     Theme variables (dark/light), base styles
e2e/                          Playwright end-to-end tests (production build)
```

### Dependency rules

- `lib/workflow` and `lib/db` never import from `components` or `store`.
  The engine is fully independent of React: it operates on plain
  `WorkflowGraph` objects and can be unit-tested in Node.
- The store (`lib/store`) is the only layer that talks to both the engine
  and IndexedDB. Components never call the engine or the DB directly.
- `reactflow.ts` is the only place that knows about `@xyflow/react` types;
  the engine never sees React Flow objects.

## Execution engine semantics

`executeWorkflow(graph, { signal, onNodeUpdate })`:

1. **Validate first.** `assertValidWorkflow` throws `WorkflowValidationError`
   (with a structured `issues` list) when the graph is invalid. An invalid
   graph can never start executing.
2. **Topological order.** Kahn's algorithm produces a deterministic execution
   order (ties broken by node id sort). A cycle is reported instead of an
   order; validation already rejects cyclic graphs.
3. **Readiness.** A node executes only when *every required input port* has
   received a value from an upstream node. Input-less nodes (Text/Number
   Input) always execute.
4. **Branching.** A Condition node activates exactly one of its `true`/`false`
   outputs. Edges leaving through the inactive output carry no value. Any node
   whose required input never receives a value — because its upstream branch
   was not taken, or an upstream node failed — is marked `skipped`
   (not failed). Skipping cascades downstream.
5. **Errors.** A node that throws (division by zero, invalid compare value,
   …) is marked `error` with the message; independent branches keep running.
   The run result reports `hasErrors`.
6. **Abort.** An `AbortSignal` is checked between nodes; remaining nodes are
   marked `skipped` and the result reports `aborted: true`. The executor yields
   to the event loop between nodes so the UI can paint and Stop works.
7. **Results.** Every node gets a `NodeRunResult` (`success`/`error`/`skipped`,
   outputs, error message, duration). The ordered execution log records start,
   per-node events, skips, and a final summary.

### Validation rules

- Unknown node types, invalid node configuration (per-node Zod schemas).
- Duplicate node/edge ids; edges referencing unknown nodes or ports.
- Port type incompatibility (`string` vs `number`; `any` matches everything).
- At most one edge per input port; every required input must be connected.
- Cycles (reported with the node sequence forming the cycle).

`canConnect` applies the same rules prospectively in the editor, including a
would-create-cycle check, so invalid edges cannot be drawn.

## State management

- **Zustand** single store (`useFlowStore`). React Flow change events flow
  through `onNodesChange`/`onEdgesChange`/`onConnect`; structural changes
  commit a history snapshot, re-run validation, clear stale execution state,
  and schedule a debounced (800 ms) IndexedDB autosave.
- **Undo/redo** (`lib/workflow/history.ts`) is a pure snapshot stack
  (cap 50). Drags commit once on drag-stop; typing in the properties panel
  commits per change; selection changes never create entries.
- Execution state (`nodeStatuses`, `nodeOutputs`, `executionLog`) is derived
  from engine callbacks and cleared whenever the graph changes, so the UI can
  never show results for a different graph revision.

## Persistence

- IndexedDB database `flowlab-db`: `workflows` store (full versioned
  documents keyed by id) and `meta` store (active workflow id, theme).
- Every read passes through `migrateWorkflow`, which upgrades older schema
  versions and validates the result. Records that fail migration are skipped
  (reported to the user) instead of crashing the app — this is the corrupted
  data recovery path.
- JSON export writes a pretty-printed, version-stamped document;
  import parses, migrates, and semantically validates before accepting.

## Offline / PWA

- `vite-plugin-pwa` generates a service worker (Workbox, `registerType:
  'prompt'`). The app shell and all hashed assets are precached, so after the
  first load the editor, engine, and saved workflows work fully offline.
- The UI shows an offline indicator (`navigator.onLine` events) and an update
  banner when a new service worker is waiting; applying the update reloads to
  the new version.

## Decisions

- **One edge per input port.** Multi-edge fan-in would need merge semantics
  (last-wins? arrays?); typed single connections keep execution predictable.
- **`any` port type.** Condition and Output accept any value type, which is
  what makes branching over heterogeneous data practical. Concrete
  `string`/`number` ports stay strict.
- **Skip, don't fail, inactive branches.** A condition that routes away from
  a subgraph is normal control flow, not an error.
- **Engine has no React dependency.** It can run in a worker or on a server
  unchanged.
- **No backend, keys, or accounts.** Everything is local-first by design.
