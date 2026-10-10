import { useState } from 'react';
import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import type { AlignDirection } from '../../lib/store/useFlowStore.ts';

interface ToolbarProps {
  onTogglePalette: () => void;
  paletteOpen: boolean;
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M4 2.5v11l9-5.5-9-5.5z" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function ResetIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 1.8v3h-3" />
    </svg>
  );
}

function UndoIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 3.5 3 7l3.5 3.5" />
      <path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H7" />
    </svg>
  );
}

function RedoIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 3.5 13 7l-3.5 3.5" />
      <path d="M13 7H6.5a3.5 3.5 0 0 0 0 7H9" />
    </svg>
  );
}

function SunIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 11.3A5.3 5.3 0 0 1 4.7 3 5.3 5.3 0 1 0 13 11.3z" />
    </svg>
  );
}

function MenuIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

function LayoutIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3" width="4" height="10" rx="1" />
      <rect x="6.5" y="3" width="4" height="6" rx="1" />
      <rect x="11.5" y="3" width="3" height="10" rx="1" />
    </svg>
  );
}

function AlignIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 1.5v13" strokeDasharray="2 1.5" />
      <rect x="2.5" y="3" width="3" height="4" rx="0.8" />
      <rect x="10.5" y="6" width="3" height="4" rx="0.8" />
    </svg>
  );
}

function InstallIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8" />
      <path d="M4.5 7 8 10.5 11.5 7" />
      <path d="M2.5 13.5h11" />
    </svg>
  );
}

function CommandIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 5.5 3 8l2.5 2.5" />
      <path d="M10.5 5.5 13 8l-2.5 2.5" />
    </svg>
  );
}

function LogoIcon(): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 13.5 20 9M12 18.5 20 23" strokeLinecap="round" />
      <circle cx="8" cy="16" r="4.2" fill="currentColor" stroke="none" />
      <circle cx="24" cy="7.5" r="4.2" fill="currentColor" stroke="none" />
      <circle cx="24" cy="24.5" r="4.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Toolbar({ onTogglePalette, paletteOpen }: ToolbarProps): JSX.Element {
  const [alignOpen, setAlignOpen] = useState(false);
  const workflowName = useFlowStore((s) => s.activeWorkflowName);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const validationIssues = useFlowStore((s) => s.validationIssues);
  const validationWarnings = useFlowStore((s) => s.validationWarnings);
  const executionPhase = useFlowStore((s) => s.executionPhase);
  const runProgress = useFlowStore((s) => s.runProgress);
  const installPromptAvailable = useFlowStore((s) => s.installPromptAvailable);
  const canUndo = useFlowStore((s) => s.canUndo);
  const canRedo = useFlowStore((s) => s.canRedo);
  const theme = useFlowStore((s) => s.theme);

  const runWorkflow = useFlowStore((s) => s.runWorkflow);
  const stopWorkflow = useFlowStore((s) => s.stopWorkflow);
  const resetExecution = useFlowStore((s) => s.resetExecution);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const toggleTheme = useFlowStore((s) => s.toggleTheme);
  const autoLayout = useFlowStore((s) => s.autoLayout);
  const alignSelected = useFlowStore((s) => s.alignSelected);
  const installApp = useFlowStore((s) => s.installApp);
  const setCommandPaletteOpen = useFlowStore((s) => s.setCommandPaletteOpen);
  const setConnectDialogOpen = useFlowStore((s) => s.setConnectDialogOpen);
  const setWorkflowsDialogOpen = useFlowStore((s) => s.setWorkflowsDialogOpen);
  const setShortcutsOpen = useFlowStore((s) => s.setShortcutsOpen);

  const isRunning = executionPhase === 'running';
  const canRun = validationIssues.length === 0 && nodes.length > 0 && !isRunning;

  return (
    <header className="toolbar">
      <button
        type="button"
        className="icon-btn palette-toggle"
        data-testid="palette-toggle"
        aria-label={paletteOpen ? 'Close node palette' : 'Open node palette'}
        aria-expanded={paletteOpen}
        onClick={onTogglePalette}
      >
        <MenuIcon />
      </button>

      <div className="brand">
        <span className="brand-logo" aria-hidden="true">
          <LogoIcon />
        </span>
        <span className="brand-name">FlowLab</span>
      </div>

      <div
        className="workflow-name"
        data-testid="workflow-name-display"
        title={workflowName}
      >
        {workflowName}
      </div>
      <div className="toolbar-stats" data-testid="graph-stats" title="Nodes and edges">
        {nodes.length} nodes · {edges.length} edges
      </div>
      {validationWarnings.length > 0 && (
        <div
          className="toolbar-warnings"
          data-testid="validation-warnings"
          title={validationWarnings.map((w) => w.message).join('\n')}
        >
          ⚠ {validationWarnings.length}
        </div>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        {isRunning && runProgress && (
          <span className="run-progress" data-testid="run-progress" aria-live="polite">
            {runProgress.done}/{runProgress.total}
          </span>
        )}
        {isRunning ? (
          <button
            type="button"
            className="btn btn-danger"
            data-testid="stop-button"
            onClick={stopWorkflow}
            aria-label="Stop workflow execution"
          >
            <StopIcon />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="execute-button"
            onClick={() => {
              void runWorkflow();
            }}
            disabled={!canRun}
            aria-label="Run workflow"
            title={canRun ? 'Run workflow (Ctrl+Enter)' : 'Resolve validation issues before running'}
          >
            <PlayIcon />
            Run
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          data-testid="reset-button"
          onClick={resetExecution}
          aria-label="Reset execution state"
          title="Reset execution state"
        >
          <ResetIcon />
        </button>
      </div>

      <div className="toolbar-divider" role="separator" aria-orientation="vertical" />

      <div className="toolbar-group">
        <button
          type="button"
          className="icon-btn"
          data-testid="auto-layout-button"
          onClick={autoLayout}
          disabled={nodes.length === 0}
          aria-label="Arrange nodes automatically"
          title="Auto-layout (arrange by flow)"
        >
          <LayoutIcon />
        </button>
        <div className="toolbar-menu-wrap">
          <button
            type="button"
            className="icon-btn"
            data-testid="align-button"
            onClick={() => setAlignOpen((v) => !v)}
            aria-label="Align selected nodes"
            title="Align selected nodes"
            aria-expanded={alignOpen}
          >
            <AlignIcon />
          </button>
          {alignOpen && (
            <div className="toolbar-menu" role="menu" aria-label="Align selected nodes">
              {(
                [
                  ['left', 'Align left'],
                  ['centerH', 'Center horizontally'],
                  ['right', 'Align right'],
                  ['top', 'Align top'],
                  ['centerV', 'Center vertically'],
                  ['bottom', 'Align bottom'],
                ] as Array<[AlignDirection, string]>
              ).map(([direction, label]) => (
                <button
                  key={direction}
                  type="button"
                  className="toolbar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    alignSelected(direction);
                    setAlignOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-divider" role="separator" aria-orientation="vertical" />

      <div className="toolbar-group">
        <button
          type="button"
          className="icon-btn"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo (Ctrl+Z)"
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo (Ctrl+Shift+Z)"
          title="Redo (Ctrl+Shift+Z)"
        >
          <RedoIcon />
        </button>
      </div>

      <div className="toolbar-divider" role="separator" aria-orientation="vertical" />

      <div className="toolbar-group">
        <button
          type="button"
          className="btn"
          data-testid="connect-button"
          onClick={() => setConnectDialogOpen(true)}
          aria-label="Create a connection without dragging"
          title="Create a connection without dragging"
        >
          Connect
        </button>
        <button
          type="button"
          className="btn"
          data-testid="workflows-button"
          onClick={() => setWorkflowsDialogOpen(true)}
          aria-label="Manage workflows"
          title="Manage workflows"
        >
          Workflows
        </button>
      </div>

      <div className="toolbar-divider" role="separator" aria-orientation="vertical" />

      <div className="toolbar-group">
        {installPromptAvailable && (
          <button
            type="button"
            className="btn"
            data-testid="install-button"
            onClick={() => {
              void installApp();
            }}
            aria-label="Install FlowLab app"
            title="Install FlowLab as an app"
          >
            <InstallIcon />
            Install
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          data-testid="command-palette-button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Command palette (Ctrl+K)"
          title="Command palette (Ctrl+K)"
        >
          <CommandIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          data-testid="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title="Toggle theme"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="icon-btn"
          data-testid="shortcuts-button"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </header>
  );
}
