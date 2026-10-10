import { useEffect } from 'react';
import type { EdgeChange, NodeChange } from '@xyflow/react';
import { useFlowStore } from '../lib/store/useFlowStore.ts';
import type { AppEdge, AppNode } from '../lib/workflow/reactflow.ts';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Global keyboard shortcuts for the workflow editor.
 *
 * - Delete/Backspace: remove the selected nodes and connections. Deletion is
 *   handled here (React Flow's built-in deleteKeyCode is disabled) so there
 *   is a single code path through the store.
 * - Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y: undo / redo.
 * - Ctrl/Cmd+D: duplicate the selected nodes.
 * - Ctrl/Cmd+C / Ctrl/Cmd+V: copy / paste the selected nodes.
 * - Ctrl/Cmd+A: select all nodes.
 * - Ctrl/Cmd+Enter: run the workflow.
 * - Ctrl/Cmd+K: command palette.
 * - Arrow keys: nudge selected nodes (Shift = 10px steps).
 * - Esc: close open dialogs, otherwise clear the canvas selection.
 *
 * Shortcuts are ignored while typing in an editable field, and (except for
 * Esc) while a dialog is open.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useFlowStore.getState();
      const { shortcutsOpen, workflowsDialogOpen, connectDialogOpen, commandPaletteOpen } = state;

      if (event.key === 'Escape') {
        if (commandPaletteOpen) {
          state.setCommandPaletteOpen(false);
        } else if (shortcutsOpen) {
          state.setShortcutsOpen(false);
        } else if (workflowsDialogOpen) {
          state.setWorkflowsDialogOpen(false);
        } else if (connectDialogOpen) {
          state.setConnectDialogOpen(false);
        } else {
          const selectedNodes = state.nodes.filter((n) => n.selected);
          const selectedEdges = state.edges.filter((e) => e.selected);
          if (selectedNodes.length > 0 || selectedEdges.length > 0) {
            const nodeChanges: NodeChange<AppNode>[] = selectedNodes.map((n) => ({
              type: 'select',
              id: n.id,
              selected: false,
            }));
            const edgeChanges: EdgeChange<AppEdge>[] = selectedEdges.map((e) => ({
              type: 'select',
              id: e.id,
              selected: false,
            }));
            state.onNodesChange(nodeChanges);
            state.onEdgesChange(edgeChanges);
          }
        }
        return;
      }

      if (isEditableTarget(event.target)) return;
      if (shortcutsOpen || workflowsDialogOpen || connectDialogOpen) return;

      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      // The command palette handles its own keys while open.
      if (commandPaletteOpen) return;

      if (mod && (key === 'k' || key === 'K')) {
        event.preventDefault();
        state.setCommandPaletteOpen(true);
        return;
      }

      if (mod && (key === 'z' || key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }

      if (mod && (key === 'y' || key === 'Y')) {
        event.preventDefault();
        state.redo();
        return;
      }

      if (mod && (key === 'd' || key === 'D')) {
        event.preventDefault();
        const ids = state.nodes.filter((n) => n.selected).map((n) => n.id);
        state.duplicateNodes(ids);
        return;
      }

      if (mod && (key === 'c' || key === 'C')) {
        event.preventDefault();
        state.copySelectedNodes();
        return;
      }

      if (mod && (key === 'v' || key === 'V')) {
        event.preventDefault();
        state.pasteNodes();
        return;
      }

      if (mod && (key === 'a' || key === 'A')) {
        event.preventDefault();
        state.selectAllNodes();
        return;
      }

      if (mod && key === 'Enter') {
        event.preventDefault();
        void state.runWorkflow();
        return;
      }

      if (key.startsWith('Arrow')) {
        const step = event.shiftKey ? 10 : 1;
        const delta: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const d = delta[key];
        if (d) {
          event.preventDefault();
          state.nudgeSelected(d[0], d[1]);
          return;
        }
      }

      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault();
        const nodeIds = state.nodes.filter((n) => n.selected).map((n) => n.id);
        if (nodeIds.length > 0) {
          state.deleteNodes(nodeIds);
        }
        // Remove selected edges that were not already removed with their nodes.
        const edgeIds = useFlowStore
          .getState()
          .edges.filter((e) => e.selected)
          .map((e) => e.id);
        if (edgeIds.length > 0) {
          const edgeChanges: EdgeChange<AppEdge>[] = edgeIds.map((id) => ({
            type: 'remove',
            id,
          }));
          state.onEdgesChange(edgeChanges);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
