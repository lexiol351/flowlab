import type { FlowEdge, FlowNode } from './types.ts';

/** A restorable snapshot of the editable graph. Generic over node/edge shapes. */
export interface GraphSnapshot<N = FlowNode, E = FlowEdge> {
  nodes: N[];
  edges: E[];
}

export interface HistoryState<N = FlowNode, E = FlowEdge> {
  past: GraphSnapshot<N, E>[];
  present: GraphSnapshot<N, E>;
  future: GraphSnapshot<N, E>[];
}

export const HISTORY_LIMIT = 50;

function cloneSnapshot<N, E>(snapshot: GraphSnapshot<N, E>): GraphSnapshot<N, E> {
  // Structured clone handles nested position/data objects for any shape.
  return structuredClone(snapshot);
}

function snapshotsEqual<N, E>(a: GraphSnapshot<N, E>, b: GraphSnapshot<N, E>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createHistory<N, E>(initial: GraphSnapshot<N, E>): HistoryState<N, E> {
  return { past: [], present: cloneSnapshot(initial), future: [] };
}

/**
 * Record a new snapshot. Identical consecutive snapshots are ignored and
 * the redo stack is cleared. Past entries are capped at `limit`.
 */
export function pushHistory<N, E>(
  state: HistoryState<N, E>,
  snapshot: GraphSnapshot<N, E>,
  limit: number = HISTORY_LIMIT,
): HistoryState<N, E> {
  const next = cloneSnapshot(snapshot);
  if (snapshotsEqual(state.present, next)) return state;
  const past = [...state.past, cloneSnapshot(state.present)];
  while (past.length > limit) past.shift();
  return { past, present: next, future: [] };
}

export function undoHistory<N, E>(state: HistoryState<N, E>): HistoryState<N, E> {
  if (state.past.length === 0) return state;
  const past = [...state.past];
  const present = past.pop() as GraphSnapshot<N, E>;
  return {
    past,
    present: cloneSnapshot(present),
    future: [cloneSnapshot(state.present), ...state.future],
  };
}

export function redoHistory<N, E>(state: HistoryState<N, E>): HistoryState<N, E> {
  if (state.future.length === 0) return state;
  const [next, ...future] = state.future;
  return {
    past: [...state.past, cloneSnapshot(state.present)],
    present: cloneSnapshot(next as GraphSnapshot<N, E>),
    future,
  };
}

export function canUndo<N, E>(state: HistoryState<N, E>): boolean {
  return state.past.length > 0;
}

export function canRedo<N, E>(state: HistoryState<N, E>): boolean {
  return state.future.length > 0;
}

/** Extract the current snapshot (convenience for the store). */
export function currentSnapshot<N, E>(state: HistoryState<N, E>): GraphSnapshot<N, E> {
  return cloneSnapshot(state.present);
}
