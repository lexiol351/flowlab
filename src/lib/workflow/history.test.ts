import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  currentSnapshot,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history.ts';
import type { GraphSnapshot } from './history.ts';

interface TestNode {
  id: string;
  x: number;
}
interface TestEdge {
  id: string;
}

type S = GraphSnapshot<TestNode, TestEdge>;

function snap(nodeIds: string[], edgeIds: string[] = []): S {
  return {
    nodes: nodeIds.map((id, i) => ({ id, x: i })),
    edges: edgeIds.map((id) => ({ id })),
  };
}

describe('history', () => {
  it('starts with no undo/redo available', () => {
    const h = createHistory(snap(['a']));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(currentSnapshot(h)).toEqual(snap(['a']));
  });

  it('pushes snapshots and undoes them in order', () => {
    let h = createHistory(snap(['a']));
    h = pushHistory(h, snap(['a', 'b']));
    h = pushHistory(h, snap(['a', 'b', 'c']));
    expect(canUndo(h)).toBe(true);

    h = undoHistory(h);
    expect(currentSnapshot(h)).toEqual(snap(['a', 'b']));
    expect(canRedo(h)).toBe(true);

    h = undoHistory(h);
    expect(currentSnapshot(h)).toEqual(snap(['a']));
    expect(canUndo(h)).toBe(false);
  });

  it('redoes undone snapshots', () => {
    let h = createHistory(snap(['a']));
    h = pushHistory(h, snap(['a', 'b']));
    h = undoHistory(h);
    h = redoHistory(h);
    expect(currentSnapshot(h)).toEqual(snap(['a', 'b']));
    expect(canRedo(h)).toBe(false);
  });

  it('clears the redo stack on a new push', () => {
    let h = createHistory(snap(['a']));
    h = pushHistory(h, snap(['a', 'b']));
    h = undoHistory(h);
    h = pushHistory(h, snap(['a', 'z']));
    expect(canRedo(h)).toBe(false);
    expect(currentSnapshot(h)).toEqual(snap(['a', 'z']));
  });

  it('ignores identical consecutive snapshots', () => {
    let h = createHistory(snap(['a']));
    const same = pushHistory(h, snap(['a']));
    expect(same).toBe(h);
    expect(canUndo(same)).toBe(false);
  });

  it('caps the past at the history limit', () => {
    let h = createHistory(snap(['s0']));
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) {
      h = pushHistory(h, snap([`s${i}`]));
    }
    let count = 0;
    let cursor = h;
    while (canUndo(cursor)) {
      cursor = undoHistory(cursor);
      count += 1;
    }
    expect(count).toBe(HISTORY_LIMIT);
  });

  it('does not mutate snapshots held by the caller', () => {
    const initial = snap(['a']);
    const h = createHistory(initial);
    initial.nodes.push({ id: 'mutated', x: 99 });
    expect(currentSnapshot(h)).toEqual(snap(['a']));
  });

  it('undo on empty past is a no-op', () => {
    const h = createHistory(snap(['a']));
    expect(undoHistory(h)).toBe(h);
  });

  it('redo on empty future is a no-op', () => {
    const h = createHistory(snap(['a']));
    expect(redoHistory(h)).toBe(h);
  });
});
