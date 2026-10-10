import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { getAllNodeDefinitions } from '../../lib/workflow/nodeRegistry.ts';
import { dispatchAddNode } from '../palette/NodePalette.tsx';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';

interface Command {
  id: string;
  title: string;
  hint: string;
  run: () => void;
}

function CommandPaletteContent({ onClose }: { onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const runWorkflow = useFlowStore((s) => s.runWorkflow);
  const stopWorkflow = useFlowStore((s) => s.stopWorkflow);
  const resetExecution = useFlowStore((s) => s.resetExecution);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const toggleTheme = useFlowStore((s) => s.toggleTheme);
  const autoLayout = useFlowStore((s) => s.autoLayout);
  const setWorkflowsDialogOpen = useFlowStore((s) => s.setWorkflowsDialogOpen);
  const setConnectDialogOpen = useFlowStore((s) => s.setConnectDialogOpen);
  const setShortcutsOpen = useFlowStore((s) => s.setShortcutsOpen);
  const executionPhase = useFlowStore((s) => s.executionPhase);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'run',
        title: executionPhase === 'running' ? 'Stop workflow' : 'Run workflow',
        hint: 'Ctrl+Enter',
        run: () => {
          if (executionPhase === 'running') stopWorkflow();
          else void runWorkflow();
        },
      },
      { id: 'reset', title: 'Reset execution state', hint: '', run: resetExecution },
      { id: 'undo', title: 'Undo', hint: 'Ctrl+Z', run: undo },
      { id: 'redo', title: 'Redo', hint: 'Ctrl+Shift+Z', run: redo },
      { id: 'layout', title: 'Auto-layout canvas', hint: '', run: autoLayout },
      { id: 'theme', title: 'Toggle dark/light theme', hint: '', run: toggleTheme },
      {
        id: 'workflows',
        title: 'Manage workflows…',
        hint: '',
        run: () => setWorkflowsDialogOpen(true),
      },
      {
        id: 'connect',
        title: 'Create connection…',
        hint: '',
        run: () => setConnectDialogOpen(true),
      },
      {
        id: 'shortcuts',
        title: 'Keyboard shortcuts…',
        hint: '',
        run: () => setShortcutsOpen(true),
      },
    ];
    for (const def of getAllNodeDefinitions()) {
      list.push({
        id: `add-${def.type}`,
        title: `Add ${def.title} node`,
        hint: def.category,
        run: () => dispatchAddNode(def.type),
      });
    }
    return list;
  }, [
    executionPhase,
    runWorkflow,
    stopWorkflow,
    resetExecution,
    undo,
    redo,
    autoLayout,
    toggleTheme,
    setWorkflowsDialogOpen,
    setConnectDialogOpen,
    setShortcutsOpen,
  ]);

  const normalized = query.trim().toLowerCase();
  const filtered =
    normalized === ''
      ? commands
      : commands.filter((c) => `${c.title} ${c.hint}`.toLowerCase().includes(normalized));
  const clampedIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  useEffect(() => {
    // Focus after the dialog paints.
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, []);

  const choose = (index: number): void => {
    const command = filtered[index];
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="modal-overlay"
      data-testid="command-palette-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
      >
        <input
          ref={inputRef}
          type="text"
          className="input command-palette-input"
          data-testid="command-palette-input"
          placeholder="Type a command or node name…"
          aria-label="Search commands"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(clampedIndex);
            } else if (event.key === 'Escape') {
              onClose();
            }
          }}
        />
        <div className="command-palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 && (
            <div className="command-palette-empty">No commands match.</div>
          )}
          {filtered.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === clampedIndex}
              className={`command-palette-item${index === clampedIndex ? ' is-active' : ''}`}
              data-testid="command-palette-item"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="command-palette-title">{command.title}</span>
              {command.hint && (
                <span className="command-palette-hint">{command.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CommandPalette(): JSX.Element | null {
  const open = useFlowStore((s) => s.commandPaletteOpen);
  const setOpen = useFlowStore((s) => s.setCommandPaletteOpen);

  // Remount the content on every open so transient UI state resets.
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;
  return <CommandPaletteContent key={session} onClose={() => setOpen(false)} />;
}
