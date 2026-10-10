import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';

interface ShortcutRow {
  keys: string[][];
  action: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: [['Ctrl/Cmd', 'Z']], action: 'Undo' },
  {
    keys: [
      ['Ctrl/Cmd', 'Shift', 'Z'],
      ['Ctrl/Cmd', 'Y'],
    ],
    action: 'Redo',
  },
  { keys: [['Ctrl/Cmd', 'D']], action: 'Duplicate selected nodes' },
  { keys: [['Ctrl/Cmd', 'C']], action: 'Copy selected nodes' },
  { keys: [['Ctrl/Cmd', 'V']], action: 'Paste nodes' },
  { keys: [['Ctrl/Cmd', 'A']], action: 'Select all nodes' },
  { keys: [['Ctrl/Cmd', 'K']], action: 'Command palette' },
  { keys: [['Ctrl/Cmd', 'Enter']], action: 'Run workflow' },
  { keys: [['Delete'], ['Backspace']], action: 'Delete selected nodes and connections' },
  { keys: [['Arrow keys']], action: 'Nudge selected nodes (Shift = 10px)' },
  { keys: [['Esc']], action: 'Close dialogs / clear selection' },
];

export function ShortcutsDialog(): JSX.Element | null {
  const open = useFlowStore((s) => s.shortcutsOpen);
  const setOpen = useFlowStore((s) => s.setShortcutsOpen);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={() => setOpen(false)}
      data-testid="shortcuts-overlay"
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-testid="shortcuts-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>Keyboard shortcuts</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close shortcuts dialog"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="dialog-body">
          <table className="shortcuts-table">
            <tbody>
              {SHORTCUTS.map((row) => (
                <tr key={row.action}>
                  <td>
                    <span className="shortcut-keys">
                      {row.keys.map((combo, index) => (
                        <span key={combo.join('+')}>
                          {index > 0 && <span aria-hidden="true"> / </span>}
                          {combo.map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
