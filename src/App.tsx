import { useState } from 'react';
import type { JSX } from 'react';
import { useFlowStore } from './lib/store/useFlowStore.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { Toolbar } from './components/layout/Toolbar.tsx';
import { NodePalette } from './components/palette/NodePalette.tsx';
import { FlowCanvas } from './components/editor/FlowCanvas.tsx';
import { Toasts } from './components/ui/Toasts.tsx';
import { StatusIndicators } from './components/ui/StatusIndicators.tsx';
import { ShortcutsDialog } from './components/ui/ShortcutsDialog.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';
import { ExecutionLogPanel } from './components/panels/ExecutionLogPanel.tsx';
import { WorkflowsDialog } from './components/workflows/WorkflowsDialog.tsx';
import { ConnectDialog } from './components/dialogs/ConnectDialog.tsx';
import { CommandPalette } from './components/ui/CommandPalette.tsx';

export default function App(): JSX.Element {
  const isBootstrapping = useFlowStore((s) => s.isBootstrapping);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useKeyboardShortcuts();

  if (isBootstrapping) {
    return (
      <div
        className="splash"
        data-testid="app-loading"
        role="status"
        aria-label="Loading FlowLab"
      >
        <div className="spinner" aria-hidden="true" />
        <p>Loading FlowLab…</p>
      </div>
    );
  }

  return (
    <div className="app" data-testid="app-root">
      <Toolbar
        onTogglePalette={() => setPaletteOpen((value) => !value)}
        paletteOpen={paletteOpen}
      />
      <div className="app-body">
        <NodePalette open={paletteOpen} />
        <main className="canvas-area">
          <FlowCanvas />
        </main>
        <aside className="right-column" aria-label="Inspector">
          <PropertiesPanel />
          <ExecutionLogPanel />
        </aside>
      </div>
      <WorkflowsDialog />
      <ConnectDialog />
      <CommandPalette />
      <ShortcutsDialog />
      <Toasts />
      <StatusIndicators />
    </div>
  );
}
