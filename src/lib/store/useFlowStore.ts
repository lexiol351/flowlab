import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';
import type {
  Connection,
  EdgeChange,
  NodeChange,
} from '@xyflow/react';
import { create } from 'zustand';
import {
  deleteWorkflow as dbDeleteWorkflow,
  getMeta,
  getWorkflow,
  listWorkflows,
  saveWorkflow,
  setMeta,
} from '../db/indexeddb.ts';
import {
  WorkflowValidationError,
  assertValidWorkflow,
  canConnect,
  executeWorkflow,
  validateWorkflow,
} from '../workflow/engine.ts';
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  currentSnapshot,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../workflow/history.ts';
import type { HistoryState } from '../workflow/history.ts';
import {
  EXAMPLE_WORKFLOWS,
  type ExampleWorkflow,
} from '../workflow/examples.ts';
import {
  migrateWorkflow,
  parseWorkflowJson,
  serializeWorkflow,
} from '../workflow/migrations.ts';
import { getNodeDefinition } from '../workflow/nodeRegistry.ts';
import {
  appGraphToWorkflow,
  appGraphToWorkflowGraph,
  newId,
  workflowToAppGraph,
} from '../workflow/reactflow.ts';
import type { AppEdge, AppNode } from '../workflow/reactflow.ts';
import type {
  LogEntry,
  NodeStatus,
  ValidationIssue,
} from '../workflow/engine.ts';
import type { NodeTypeId, PortValue, WorkflowV1 } from '../workflow/types.ts';
import type { WorkflowIndexEntry } from '../db/indexeddb.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

export type Theme = 'dark' | 'light';
export type ExecutionPhase = 'idle' | 'running';

export interface LastRunSummary {
  hasErrors: boolean;
  aborted: boolean;
  at: string;
}

/** A persisted record of a past workflow run. */
export interface RunRecord {
  runId: string;
  startedAt: string;
  nodeCount: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  totalDurationMs: number;
  aborted: boolean;
  timedOut: boolean;
}

export type AlignDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'centerH'
  | 'centerV';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface FlowStoreState {
  // --- workflows ---
  workflowIndex: WorkflowIndexEntry[];
  activeWorkflowId: string | null;
  activeWorkflowName: string;
  activeWorkflowCreatedAt: string;
  isBootstrapping: boolean;

  // --- graph ---
  nodes: AppNode[];
  edges: AppEdge[];
  selectedNodeId: string | null;

  // --- history ---
  canUndo: boolean;
  canRedo: boolean;

  // --- validation ---
  /** Errors block execution. */
  validationIssues: ValidationIssue[];
  /** Non-blocking warnings (e.g. dead-end nodes). */
  validationWarnings: ValidationIssue[];

  // --- execution ---
  executionPhase: ExecutionPhase;
  nodeStatuses: Record<string, NodeStatus>;
  nodeOutputs: Record<string, Record<string, PortValue>>;
  executionLog: LogEntry[];
  lastRunSummary: LastRunSummary | null;
  /** Live progress while running; null when idle. */
  runProgress: { done: number; total: number } | null;
  /** Transmitted values per edge from the last run (truncated for display). */
  edgeValues: Record<string, string>;
  /** Persisted history of past runs for the active workflow (newest first). */
  runHistory: RunRecord[];
  /** Per-workflow descriptions, keyed by workflow id. */
  workflowDescriptions: Record<string, string>;

  // --- ui ---
  theme: Theme;
  toasts: Toast[];
  online: boolean;
  updateAvailable: boolean;
  shortcutsOpen: boolean;
  workflowsDialogOpen: boolean;
  connectDialogOpen: boolean;
  commandPaletteOpen: boolean;
  installPromptAvailable: boolean;

  // --- actions: lifecycle ---
  bootstrap: () => Promise<void>;

  // --- actions: workflows ---
  createWorkflow: (name?: string) => Promise<void>;
  renameWorkflow: (id: string, name: string) => Promise<void>;
  setWorkflowDescription: (id: string, description: string) => Promise<void>;
  duplicateWorkflow: (id: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  switchWorkflow: (id: string) => Promise<void>;
  loadExample: (exampleId: string) => Promise<void>;
  importWorkflow: (file: File) => Promise<void>;
  exportWorkflow: (id?: string) => void;

  // --- actions: graph editing ---
  autoLayout: () => void;
  copySelectedNodes: () => void;
  pasteNodes: () => void;
  alignSelected: (direction: AlignDirection) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  selectAllNodes: () => void;
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeDragStop: () => void;
  addNode: (type: NodeTypeId, position: { x: number; y: number }) => void;
  deleteNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[]) => void;
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void;
  setNodeLabel: (nodeId: string, label: string) => void;

  // --- actions: history ---
  undo: () => void;
  redo: () => void;

  // --- actions: execution ---
  runWorkflow: () => Promise<void>;
  stopWorkflow: () => void;
  resetExecution: () => void;
  exportExecutionLog: () => void;

  // --- actions: ui ---
  toggleTheme: () => void;
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
  setOnline: (online: boolean) => void;
  setUpdateAvailable: (available: boolean) => void;
  applyUpdate: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setWorkflowsDialogOpen: (open: boolean) => void;
  setConnectDialogOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setInstallPromptAvailable: (available: boolean) => void;
  installApp: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level (non-reactive) pieces
// ---------------------------------------------------------------------------

let history: HistoryState<AppNode, AppEdge> = createHistory<AppNode, AppEdge>({
  nodes: [],
  edges: [],
});
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;
let applyServiceWorkerUpdate: (() => void) | null = null;
/** Internal clipboard for copy/paste (node ids are remapped on paste). */
let clipboard: { nodes: AppNode[]; edges: AppEdge[] } | null = null;
let installPromptEvent: BeforeInstallPromptEvent | null = null;

const RUN_HISTORY_LIMIT = 10;

async function loadRunHistory(): Promise<Record<string, RunRecord[]>> {
  try {
    const value = await getMeta('runHistory');
    return (value ?? {}) as Record<string, RunRecord[]>;
  } catch {
    return {};
  }
}

async function persistRunHistory(history: Record<string, RunRecord[]>): Promise<void> {
  try {
    await setMeta('runHistory', history);
  } catch {
    /* persistence is best-effort */
  }
}

async function loadDescriptions(): Promise<Record<string, string>> {
  try {
    const value = await getMeta('descriptions');
    return (value ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Called from main.tsx once the PWA registration is ready. */
export function registerServiceWorkerUpdate(fn: () => void): void {
  applyServiceWorkerUpdate = fn;
}

/** Called from main.tsx when the browser fires beforeinstallprompt. */
export function registerInstallPrompt(event: BeforeInstallPromptEvent): void {
  event.preventDefault();
  installPromptEvent = event;
  useFlowStore.getState().setInstallPromptAvailable(true);
}

export function getExampleWorkflows(): ExampleWorkflow[] {
  return EXAMPLE_WORKFLOWS;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const AUTOSAVE_DELAY_MS = 800;

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export const useFlowStore = create<FlowStoreState>()((set, get) => {
  /** Persist the active workflow to IndexedDB (debounced). */
  function scheduleAutosave(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void persistActive();
    }, AUTOSAVE_DELAY_MS);
  }

  async function persistActive(): Promise<void> {
    const { activeWorkflowId, activeWorkflowName, activeWorkflowCreatedAt, nodes, edges } = get();
    if (!activeWorkflowId) return;
    const workflow = appGraphToWorkflow(
      activeWorkflowId,
      activeWorkflowName,
      nodes,
      edges,
      activeWorkflowCreatedAt,
    );
    try {
      await saveWorkflow(workflow);
      set((s) => ({
        workflowIndex: s.workflowIndex.map((entry) =>
          entry.id === activeWorkflowId
            ? { ...entry, name: activeWorkflowName, updatedAt: workflow.updatedAt }
            : entry,
        ),
      }));
    } catch (err) {
      console.error('Autosave failed:', err);
      get().pushToast('error', 'Failed to save workflow locally.');
    }
  }

  /** Flush any pending autosave immediately. */
  async function flushAutosave(): Promise<void> {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    await persistActive();
  }

  /**
   * Commit a graph change: push history, revalidate, schedule autosave,
   * and clear stale execution state (results no longer match the graph).
   */
  function splitIssues(issues: ValidationIssue[]): {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  } {
    return {
      errors: issues.filter((i) => i.severity !== 'warning'),
      warnings: issues.filter((i) => i.severity === 'warning'),
    };
  }

  function commitGraph(nodes: AppNode[], edges: AppEdge[]): void {
    history = pushHistory(history, { nodes, edges });
    const { errors, warnings } = splitIssues(
      validateWorkflow(appGraphToWorkflowGraph(nodes, edges)),
    );
    set({
      nodes,
      edges,
      canUndo: historyCanUndo(history),
      canRedo: historyCanRedo(history),
      validationIssues: errors,
      validationWarnings: warnings,
      // Execution results describe the previous graph revision.
      nodeStatuses: {},
      nodeOutputs: {},
      executionLog: [],
      lastRunSummary: null,
    });
    scheduleAutosave();
  }

  function loadGraphIntoEditor(workflow: WorkflowV1): void {
    const { nodes, edges } = workflowToAppGraph(workflow);
    history = createHistory({ nodes, edges });
    const { errors, warnings } = splitIssues(
      validateWorkflow(appGraphToWorkflowGraph(nodes, edges)),
    );
    set({
      activeWorkflowId: workflow.id,
      activeWorkflowName: workflow.name,
      activeWorkflowCreatedAt: workflow.createdAt,
      nodes,
      edges,
      selectedNodeId: null,
      canUndo: false,
      canRedo: false,
      validationIssues: errors,
      validationWarnings: warnings,
      nodeStatuses: {},
      nodeOutputs: {},
      executionLog: [],
      lastRunSummary: null,
      runProgress: null,
      edgeValues: {},
      executionPhase: 'idle',
    });
    void (async () => {
      const all = await loadRunHistory();
      if (get().activeWorkflowId === workflow.id) {
        set({ runHistory: all[workflow.id] ?? [] });
      }
    })();
  }

  return {
    // --- initial state ---
    workflowIndex: [],
    activeWorkflowId: null,
    activeWorkflowName: '',
    activeWorkflowCreatedAt: '',
    isBootstrapping: true,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    canUndo: false,
    canRedo: false,
    validationIssues: [],
    validationWarnings: [],
    runProgress: null,
    edgeValues: {},
    runHistory: [],
    workflowDescriptions: {},
    commandPaletteOpen: false,
    installPromptAvailable: false,
    executionPhase: 'idle',
    nodeStatuses: {},
    nodeOutputs: {},
    executionLog: [],
    lastRunSummary: null,
    theme: 'dark',
    toasts: [],
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    updateAvailable: false,
    shortcutsOpen: false,
    workflowsDialogOpen: false,
    connectDialogOpen: false,

    // --- lifecycle ---
    bootstrap: async () => {
      const savedTheme = await getMeta('theme').catch(() => undefined);
      const theme: Theme = savedTheme === 'light' ? 'light' : 'dark';
      applyTheme(theme);

      const { workflows, corruptedIds } = await listWorkflows();
      if (corruptedIds.length > 0) {
        get().pushToast(
          'error',
          `Skipped ${corruptedIds.length} corrupted saved workflow(s). Your other workflows are intact.`,
        );
      }

      let index: WorkflowIndexEntry[] = workflows.map((w) => ({
        id: w.id,
        name: w.name,
        updatedAt: w.updatedAt,
      }));

      if (workflows.length === 0) {
        const now = new Date().toISOString();
        const fresh: WorkflowV1 = {
          version: 1,
          id: newId('wf'),
          name: 'Untitled workflow',
          createdAt: now,
          updatedAt: now,
          nodes: [],
          edges: [],
        };
        await saveWorkflow(fresh);
        index = [{ id: fresh.id, name: fresh.name, updatedAt: fresh.updatedAt }];
        await setMeta('activeWorkflowId', fresh.id).catch(() => undefined);
        loadGraphIntoEditor(fresh);
      } else {
        const savedActive = (await getMeta('activeWorkflowId').catch(() => undefined)) as
          | string
          | undefined;
        const activeId =
          savedActive && index.some((e) => e.id === savedActive) ? savedActive : index[0].id;
        const workflow = await getWorkflow(activeId);
        if (workflow) {
          loadGraphIntoEditor(workflow);
        } else {
          const fallback = workflows[0];
          loadGraphIntoEditor(fallback);
        }
      }

      set({ workflowIndex: index, theme, isBootstrapping: false });

      // Load auxiliary metadata (descriptions, run history) in the background.
      void (async () => {
        const [descriptions, historyMap] = await Promise.all([
          loadDescriptions(),
          loadRunHistory(),
        ]);
        const activeId = get().activeWorkflowId;
        set({
          workflowDescriptions: descriptions,
          runHistory: activeId ? (historyMap[activeId] ?? []) : [],
        });
      })();
      await setMeta('theme', theme).catch(() => undefined);
    },

    // --- workflows ---
    createWorkflow: async (name = 'Untitled workflow') => {
      await flushAutosave();
      const now = new Date().toISOString();
      const workflow: WorkflowV1 = {
        version: 1,
        id: newId('wf'),
        name,
        createdAt: now,
        updatedAt: now,
        nodes: [],
        edges: [],
      };
      await saveWorkflow(workflow);
      set((s) => ({
        workflowIndex: [
          { id: workflow.id, name: workflow.name, updatedAt: workflow.updatedAt },
          ...s.workflowIndex,
        ],
      }));
      await setMeta('activeWorkflowId', workflow.id).catch(() => undefined);
      loadGraphIntoEditor(workflow);
      get().pushToast('success', `Created workflow "${name}".`);
    },

    setWorkflowDescription: async (id, description) => {
      const trimmed = description.trim();
      const next = { ...get().workflowDescriptions };
      if (trimmed) next[id] = trimmed;
      else delete next[id];
      set({ workflowDescriptions: next });
      try {
        await setMeta('descriptions', next);
      } catch {
        get().pushToast('error', 'Could not save the description.');
      }
    },

    renameWorkflow: async (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        get().pushToast('error', 'Workflow name cannot be empty.');
        return;
      }
      const workflow = await getWorkflow(id);
      if (!workflow) {
        get().pushToast('error', 'Workflow not found.');
        return;
      }
      const updated: WorkflowV1 = {
        ...workflow,
        name: trimmed,
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflow(updated);
      set((s) => ({
        workflowIndex: s.workflowIndex.map((e) =>
          e.id === id ? { ...e, name: trimmed, updatedAt: updated.updatedAt } : e,
        ),
        activeWorkflowName: s.activeWorkflowId === id ? trimmed : s.activeWorkflowName,
      }));
    },

    duplicateWorkflow: async (id) => {
      await flushAutosave();
      const workflow = await getWorkflow(id);
      if (!workflow) {
        get().pushToast('error', 'Workflow not found.');
        return;
      }
      const now = new Date().toISOString();
      const copy: WorkflowV1 = {
        ...migrateWorkflow(workflow),
        id: newId('wf'),
        name: `${workflow.name} copy`,
        createdAt: now,
        updatedAt: now,
      };
      await saveWorkflow(copy);
      set((s) => ({
        workflowIndex: [
          { id: copy.id, name: copy.name, updatedAt: copy.updatedAt },
          ...s.workflowIndex,
        ],
      }));
      await setMeta('activeWorkflowId', copy.id).catch(() => undefined);
      loadGraphIntoEditor(copy);
      get().pushToast('success', `Duplicated as "${copy.name}".`);
    },

    deleteWorkflow: async (id) => {
      await flushAutosave();
      await dbDeleteWorkflow(id);
      const remaining = get().workflowIndex.filter((e) => e.id !== id);
      set({ workflowIndex: remaining });
      get().pushToast('info', 'Workflow deleted.');
      if (get().activeWorkflowId === id) {
        if (remaining.length > 0) {
          await get().switchWorkflow(remaining[0].id);
        } else {
          await get().createWorkflow('Untitled workflow');
        }
      }
    },

    switchWorkflow: async (id) => {
      if (id === get().activeWorkflowId) return;
      await flushAutosave();
      const workflow = await getWorkflow(id);
      if (!workflow) {
        get().pushToast('error', 'Workflow not found.');
        return;
      }
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      await setMeta('activeWorkflowId', id).catch(() => undefined);
      loadGraphIntoEditor(workflow);
    },

    loadExample: async (exampleId) => {
      const example = EXAMPLE_WORKFLOWS.find((e) => e.id === exampleId);
      if (!example) {
        get().pushToast('error', 'Example not found.');
        return;
      }
      await flushAutosave();
      const built = example.build();
      const existingIds = new Set(get().workflowIndex.map((e) => e.id));
      const workflow: WorkflowV1 = {
        ...built,
        id: existingIds.has(built.id) ? newId('wf') : built.id,
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflow(workflow);
      set((s) => ({
        workflowIndex: [
          { id: workflow.id, name: workflow.name, updatedAt: workflow.updatedAt },
          ...s.workflowIndex.filter((e) => e.id !== workflow.id),
        ],
      }));
      await setMeta('activeWorkflowId', workflow.id).catch(() => undefined);
      loadGraphIntoEditor(workflow);
      get().pushToast('success', `Loaded example "${workflow.name}". Press Run to execute it.`);
    },

    importWorkflow: async (file) => {
      await flushAutosave();
      let text: string;
      try {
        text = await file.text();
      } catch {
        get().pushToast('error', 'Could not read the selected file.');
        return;
      }
      let workflow: WorkflowV1;
      try {
        workflow = parseWorkflowJson(text);
      } catch (err) {
        get().pushToast(
          'error',
          `Import failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      // Validate semantics (ports, types, cycles) before accepting.
      try {
        assertValidWorkflow({ nodes: workflow.nodes, edges: workflow.edges });
      } catch (err) {
        const issues =
          err instanceof WorkflowValidationError
            ? err.issues.map((i) => i.message).join(' ')
            : String(err);
        get().pushToast('error', `Import failed: workflow is invalid. ${issues}`);
        return;
      }
      const existingIds = new Set(get().workflowIndex.map((e) => e.id));
      const imported: WorkflowV1 = {
        ...workflow,
        id: existingIds.has(workflow.id) ? newId('wf') : workflow.id,
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflow(imported);
      set((s) => ({
        workflowIndex: [
          { id: imported.id, name: imported.name, updatedAt: imported.updatedAt },
          ...s.workflowIndex.filter((e) => e.id !== imported.id),
        ],
      }));
      await setMeta('activeWorkflowId', imported.id).catch(() => undefined);
      loadGraphIntoEditor(imported);
      get().pushToast('success', `Imported workflow "${imported.name}".`);
    },

    exportWorkflow: (id) => {
      const targetId = id ?? get().activeWorkflowId;
      if (!targetId) return;
      const { activeWorkflowName, activeWorkflowCreatedAt, nodes, edges } = get();
      const workflow =
        targetId === get().activeWorkflowId
          ? appGraphToWorkflow(targetId, activeWorkflowName, nodes, edges, activeWorkflowCreatedAt)
          : null;
      const doDownload = (wf: WorkflowV1): void => {
        let serialized: string;
        try {
          serialized = serializeWorkflow(wf);
        } catch (err) {
          get().pushToast('error', `Export failed: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        const blob = new Blob([serialized], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `flowlab-${wf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        get().pushToast('success', `Exported "${wf.name}".`);
      };
      if (workflow) {
        doDownload(workflow);
      } else {
        void getWorkflow(targetId).then((wf) => {
          if (wf) doDownload(wf);
          else get().pushToast('error', 'Workflow not found.');
        });
      }
    },

    // --- graph editing ---
    onNodesChange: (changes) => {
      const nodes = applyNodeChanges(changes, get().nodes);
      const structural = changes.some((c) => c.type === 'add' || c.type === 'remove');
      const selectedNodeId = nodes.find((n) => n.selected)?.id ?? null;
      if (structural) {
        commitGraph(nodes, get().edges);
      } else {
        set({ nodes, selectedNodeId });
      }
    },

    onEdgesChange: (changes) => {
      const edges = applyEdgeChanges(changes, get().edges);
      const structural = changes.some((c) => c.type === 'add' || c.type === 'remove');
      if (structural) {
        commitGraph(get().nodes, edges);
      } else {
        set({ edges });
      }
    },

    onConnect: (connection) => {
      const { nodes, edges } = get();
      if (!connection.source || !connection.target) return;
      const check = canConnect(appGraphToWorkflowGraph(nodes, edges), {
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? '',
        target: connection.target,
        targetHandle: connection.targetHandle ?? '',
      });
      if (!check.ok) {
        get().pushToast('error', check.reason ?? 'Connection not allowed.');
        return;
      }
      const nextEdges = addEdge({ ...connection, id: newId('edge') }, edges);
      commitGraph(nodes, nextEdges);
    },

    onNodeDragStop: () => {
      commitGraph(get().nodes, get().edges);
    },

    addNode: (type, position) => {
      const def = getNodeDefinition(type);
      const node: AppNode = {
        id: newId('node'),
        type: 'flowNode',
        position: { ...position },
        selected: true,
        data: { nodeType: type, config: def.defaultData() },
      };
      const nodes = [...get().nodes.map((n) => ({ ...n, selected: false })), node];
      commitGraph(nodes, get().edges);
      set({ selectedNodeId: node.id });
    },

    deleteNodes: (ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nodes = get().nodes.filter((n) => !idSet.has(n.id));
      const edges = get().edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target));
      commitGraph(nodes, edges);
      set({ selectedNodeId: null });
    },

    duplicateNodes: (ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const clones: AppNode[] = [];
      const idMap = new Map<string, string>();
      for (const node of get().nodes) {
        if (!idSet.has(node.id)) continue;
        const cloneId = newId('node');
        idMap.set(node.id, cloneId);
        clones.push({
          ...node,
          id: cloneId,
          position: { x: node.position.x + 48, y: node.position.y + 48 },
          data: { ...node.data, config: { ...node.data.config } },
          selected: false,
        });
      }
      // Duplicate internal edges between the cloned nodes.
      const clonedEdges: AppEdge[] = [];
      for (const edge of get().edges) {
        const newSource = idMap.get(edge.source);
        const newTarget = idMap.get(edge.target);
        if (newSource && newTarget) {
          clonedEdges.push({
            ...edge,
            id: newId('edge'),
            source: newSource,
            target: newTarget,
            selected: false,
          });
        }
      }
      commitGraph(
        [...get().nodes, ...clones],
        [...get().edges, ...clonedEdges],
      );
    },

    autoLayout: () => {
      const { nodes, edges } = get();
      if (nodes.length === 0) return;
      // Depth = longest path from any source (Kahn's algorithm).
      const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
      const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
      const outgoing = new Map<string, string[]>();
      for (const edge of edges) {
        if (!depth.has(edge.source) || !depth.has(edge.target)) continue;
        outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      }
      const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
      const seen = new Set(queue);
      while (queue.length > 0) {
        const id = queue.shift() as string;
        for (const next of outgoing.get(id) ?? []) {
          const d = Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1);
          depth.set(next, d);
          inDegree.set(next, (inDegree.get(next) ?? 1) - 1);
          if ((inDegree.get(next) ?? 0) <= 0 && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      const layers = new Map<number, AppNode[]>();
      for (const node of nodes) {
        const d = depth.get(node.id) ?? 0;
        layers.set(d, [...(layers.get(d) ?? []), node]);
      }
      const positioned = new Map<string, { x: number; y: number }>();
      for (const [d, layerNodes] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
        layerNodes.forEach((node, i) => {
          positioned.set(node.id, { x: 80 + d * 300, y: 80 + i * 180 });
        });
      }
      commitGraph(
        nodes.map((n) => ({ ...n, position: positioned.get(n.id) ?? n.position })),
        edges,
      );
      get().pushToast('success', 'Canvas arranged automatically.');
    },

    copySelectedNodes: () => {
      const { nodes, edges } = get();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const idSet = new Set(selected.map((n) => n.id));
      clipboard = {
        nodes: selected.map((n) => ({
          ...n,
          position: { ...n.position },
          data: { ...n.data, config: { ...n.data.config } },
        })),
        edges: edges.filter((e) => idSet.has(e.source) && idSet.has(e.target)),
      };
      get().pushToast('info', `Copied ${selected.length} node(s). Press Ctrl+V to paste.`);
    },

    pasteNodes: () => {
      if (!clipboard || clipboard.nodes.length === 0) return;
      const idMap = new Map<string, string>();
      const clones: AppNode[] = clipboard.nodes.map((n) => {
        const cloneId = newId('node');
        idMap.set(n.id, cloneId);
        return {
          ...n,
          id: cloneId,
          position: { x: n.position.x + 48, y: n.position.y + 48 },
          data: { ...n.data, config: { ...n.data.config } },
          selected: true,
        };
      });
      const clonedEdges: AppEdge[] = clipboard.edges.flatMap((e) => {
        const newSource = idMap.get(e.source);
        const newTarget = idMap.get(e.target);
        return newSource && newTarget
          ? [{ ...e, id: newId('edge'), source: newSource, target: newTarget, selected: false }]
          : [];
      });
      const nodes = [...get().nodes.map((n) => ({ ...n, selected: false })), ...clones];
      commitGraph(nodes, [...get().edges, ...clonedEdges]);
      set({ selectedNodeId: clones[clones.length - 1].id });
    },

    alignSelected: (direction) => {
      const selected = get().nodes.filter((n) => n.selected);
      if (selected.length < 2) {
        get().pushToast('info', 'Select at least two nodes to align.');
        return;
      }
      const xs = selected.map((n) => n.position.x);
      const ys = selected.map((n) => n.position.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const aligned = new Map<string, { x: number; y: number }>();
      for (const node of selected) {
        const { x, y } = node.position;
        switch (direction) {
          case 'left': aligned.set(node.id, { x: minX, y }); break;
          case 'right': aligned.set(node.id, { x: maxX, y }); break;
          case 'top': aligned.set(node.id, { x, y: minY }); break;
          case 'bottom': aligned.set(node.id, { x, y: maxY }); break;
          case 'centerH': aligned.set(node.id, { x: midX, y }); break;
          case 'centerV': aligned.set(node.id, { x, y: midY }); break;
        }
      }
      commitGraph(
        get().nodes.map((n) => {
          const p = aligned.get(n.id);
          return p ? { ...n, position: p } : n;
        }),
        get().edges,
      );
    },

    nudgeSelected: (dx, dy) => {
      const selected = get().nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const ids = new Set(selected.map((n) => n.id));
      // Nudging is a transient move — don't spam history.
      set({
        nodes: get().nodes.map((n) =>
          ids.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
        ),
      });
      scheduleAutosave();
    },

    selectAllNodes: () => {
      const nodes = get().nodes;
      if (nodes.length === 0) return;
      set({
        nodes: nodes.map((n) => ({ ...n, selected: true })),
        selectedNodeId: nodes[nodes.length - 1].id,
      });
    },

    updateNodeConfig: (nodeId, patch) => {
      const nodes = get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
      );
      commitGraph(nodes, get().edges);
    },

    setNodeLabel: (nodeId, label) => {
      const nodes = get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
      );
      commitGraph(nodes, get().edges);
    },

    // --- history ---
    undo: () => {
      const next = undoHistory(history);
      if (next === history) return;
      history = next;
      const { nodes, edges } = currentSnapshot(history);
      const { errors, warnings } = splitIssues(
        validateWorkflow(appGraphToWorkflowGraph(nodes, edges)),
      );
      set({
        nodes,
        edges,
        selectedNodeId: null,
        canUndo: historyCanUndo(history),
        canRedo: historyCanRedo(history),
        validationIssues: errors,
        validationWarnings: warnings,
        nodeStatuses: {},
        nodeOutputs: {},
        executionLog: [],
        lastRunSummary: null,
      });
      scheduleAutosave();
    },

    redo: () => {
      const next = redoHistory(history);
      if (next === history) return;
      history = next;
      const { nodes, edges } = currentSnapshot(history);
      const { errors, warnings } = splitIssues(
        validateWorkflow(appGraphToWorkflowGraph(nodes, edges)),
      );
      set({
        nodes,
        edges,
        selectedNodeId: null,
        canUndo: historyCanUndo(history),
        canRedo: historyCanRedo(history),
        validationIssues: errors,
        validationWarnings: warnings,
        nodeStatuses: {},
        nodeOutputs: {},
        executionLog: [],
        lastRunSummary: null,
      });
      scheduleAutosave();
    },

    // --- execution ---
    runWorkflow: async () => {
      const { executionPhase, nodes, edges } = get();
      if (executionPhase === 'running') return;
      const graph = appGraphToWorkflowGraph(nodes, edges);
      try {
        assertValidWorkflow(graph);
      } catch (err) {
        const issues =
          err instanceof WorkflowValidationError ? err.issues : [{ message: String(err) }];
        get().pushToast(
          'error',
          `Cannot run: ${issues
            .slice(0, 2)
            .map((i) => ('message' in i ? String(i.message) : String(i)))
            .join(' ')}`,
        );
        return;
      }

      abortController = new AbortController();
      const totalNodes = nodes.length;
      set({
        executionPhase: 'running',
        nodeStatuses: Object.fromEntries(nodes.map((n) => [n.id, 'idle' as NodeStatus])),
        nodeOutputs: {},
        executionLog: [],
        lastRunSummary: null,
        runProgress: { done: 0, total: totalNodes },
        edgeValues: {},
      });
      const runStartedAt = new Date().toISOString();
      let finishedCount = 0;

      try {
        const result = await executeWorkflow(graph, {
          signal: abortController.signal,
          // NOTE: do not reference `result` here — this callback fires while
          // executeWorkflow is still running, before `result` is assigned.
          onNodeUpdate: (nodeId, nodeResult) => {
            if (nodeResult === null) {
              set((s) => ({ nodeStatuses: { ...s.nodeStatuses, [nodeId]: 'running' } }));
            } else {
              finishedCount += 1;
              set((s) => ({
                nodeStatuses: { ...s.nodeStatuses, [nodeId]: nodeResult.status },
                nodeOutputs:
                  Object.keys(nodeResult.outputs).length > 0
                    ? { ...s.nodeOutputs, [nodeId]: nodeResult.outputs }
                    : s.nodeOutputs,
                runProgress: { done: finishedCount, total: totalNodes },
              }));
            }
          },
        });
        // Sync final state (log entries added after the last node update).
        const statuses: Record<string, NodeStatus> = {};
        const outputs: Record<string, Record<string, PortValue>> = {};
        for (const [nodeId, r] of Object.entries(result.nodeResults)) {
          statuses[nodeId] = r.status;
          if (Object.keys(r.outputs).length > 0) outputs[nodeId] = r.outputs;
        }
        const edgeValues: Record<string, string> = {};
        for (const [edgeId, value] of Object.entries(result.edgeValues)) {
          const text = typeof value === 'string' ? value : String(value);
          edgeValues[edgeId] = text.length > 48 ? `${text.slice(0, 47)}…` : text;
        }
        set({
          executionPhase: 'idle',
          nodeStatuses: statuses,
          nodeOutputs: outputs,
          executionLog: result.log,
          runProgress: null,
          edgeValues,
          lastRunSummary: {
            hasErrors: result.hasErrors,
            aborted: result.aborted,
            at: new Date().toISOString(),
          },
        });
        // Record into persisted run history.
        const activeId = get().activeWorkflowId;
        if (activeId) {
          const record: RunRecord = {
            runId: result.runId,
            startedAt: runStartedAt,
            nodeCount: totalNodes,
            successCount: Object.values(result.nodeResults).filter((r) => r.status === 'success').length,
            errorCount: Object.values(result.nodeResults).filter((r) => r.status === 'error').length,
            skippedCount: Object.values(result.nodeResults).filter((r) => r.status === 'skipped').length,
            totalDurationMs: Math.round(result.totalDurationMs),
            aborted: result.aborted,
            timedOut: result.timedOut,
          };
          const next = [record, ...get().runHistory].slice(0, RUN_HISTORY_LIMIT);
          set({ runHistory: next });
          void (async () => {
            const all = await loadRunHistory();
            all[activeId] = next;
            await persistRunHistory(all);
          })();
        }
        if (result.timedOut) {
          get().pushToast('error', 'Run timed out.');
        } else if (result.aborted) {
          get().pushToast('info', 'Run stopped.');
        } else if (result.hasErrors) {
          get().pushToast('error', 'Run finished with errors — see the log.');
        } else {
          get().pushToast('success', 'Run completed successfully.');
        }
      } catch (err) {
        set({ executionPhase: 'idle', runProgress: null });
        get().pushToast(
          'error',
          `Run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        abortController = null;
      }
    },

    stopWorkflow: () => {
      abortController?.abort();
    },

    resetExecution: () => {
      if (get().executionPhase === 'running') {
        abortController?.abort();
      }
      set({
        executionPhase: 'idle',
        nodeStatuses: {},
        nodeOutputs: {},
        executionLog: [],
        lastRunSummary: null,
        runProgress: null,
        edgeValues: {},
      });
    },

    exportExecutionLog: () => {
      const { executionLog, activeWorkflowName } = get();
      if (executionLog.length === 0) {
        get().pushToast('info', 'The execution log is empty.');
        return;
      }
      const blob = new Blob([JSON.stringify(executionLog, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(activeWorkflowName || 'workflow').replace(/[^a-z0-9-_]+/gi, '_')}-log.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      get().pushToast('success', 'Execution log exported.');
    },

    // --- ui ---
    toggleTheme: () => {
      const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      set({ theme });
      void setMeta('theme', theme).catch(() => undefined);
    },

    pushToast: (kind, message) => {
      const id = newId('toast');
      set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, message }] }));
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 4500);
    },

    dismissToast: (id) => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    setOnline: (online) => set({ online }),

    setUpdateAvailable: (available) => set({ updateAvailable: available }),

    applyUpdate: () => {
      if (applyServiceWorkerUpdate) {
        applyServiceWorkerUpdate();
      } else {
        window.location.reload();
      }
    },

    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    setWorkflowsDialogOpen: (open) => set({ workflowsDialogOpen: open }),
    setConnectDialogOpen: (open) => set({ connectDialogOpen: open }),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    setInstallPromptAvailable: (available) => set({ installPromptAvailable: available }),
    installApp: async () => {
      if (!installPromptEvent) return;
      try {
        await installPromptEvent.prompt();
      } finally {
        installPromptEvent = null;
        set({ installPromptAvailable: false });
      }
    },
  };
});
