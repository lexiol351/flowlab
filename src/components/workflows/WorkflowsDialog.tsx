import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { getExampleWorkflows, useFlowStore } from '../../lib/store/useFlowStore.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import '../panels/panels.css';

function WorkflowsDialogContent({ onClose }: { onClose: () => void }): JSX.Element {
  const workflowIndex = useFlowStore((s) => s.workflowIndex);
  const activeWorkflowId = useFlowStore((s) => s.activeWorkflowId);
  const createWorkflow = useFlowStore((s) => s.createWorkflow);
  const renameWorkflow = useFlowStore((s) => s.renameWorkflow);
  const duplicateWorkflow = useFlowStore((s) => s.duplicateWorkflow);
  const deleteWorkflow = useFlowStore((s) => s.deleteWorkflow);
  const switchWorkflow = useFlowStore((s) => s.switchWorkflow);
  const loadExample = useFlowStore((s) => s.loadExample);
  const importWorkflow = useFlowStore((s) => s.importWorkflow);
  const exportWorkflow = useFlowStore((s) => s.exportWorkflow);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const startRename = (id: string, currentName: string): void => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = (id: string): void => {
    void renameWorkflow(id, renameValue);
    setRenamingId(null);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // importWorkflow reports success via a toast; close only on success.
    const seenToastIds = new Set(useFlowStore.getState().toasts.map((t) => t.id));
    await importWorkflow(file);
    const imported = useFlowStore
      .getState()
      .toasts.some(
        (t) =>
          !seenToastIds.has(t.id) &&
          t.kind === 'success' &&
          t.message.startsWith('Imported workflow'),
      );
    if (imported) onClose();
  };

  const pendingDeleteName =
    workflowIndex.find((w) => w.id === pendingDeleteId)?.name ?? 'this workflow';

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fl-workflows-title"
        data-testid="workflows-dialog"
        className="fl-dialog"
      >
        <div className="fl-dialog-header">
          <h2 id="fl-workflows-title" className="fl-dialog-title">
            Workflows
          </h2>
          <button
            type="button"
            className="fl-btn fl-btn-ghost fl-btn-sm"
            aria-label="Close workflows dialog"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="fl-dialog-body">
          <section aria-label="Your workflows">
            <h3 className="fl-section-title">Your workflows</h3>
            <div className="fl-btn-row" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="fl-btn fl-btn-primary fl-btn-sm"
                data-testid="new-workflow-button"
                onClick={() => {
                  void createWorkflow().then(() => onClose());
                }}
              >
                New workflow
              </button>
              <button
                type="button"
                className="fl-btn fl-btn-sm"
                data-testid="import-button"
                onClick={() => importInputRef.current?.click()}
              >
                Import JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                data-testid="import-input"
                className="fl-hidden-input"
                aria-label="Import workflow JSON file"
                onChange={(e) => {
                  void handleImportFile(e);
                }}
              />
            </div>
            <ul className="fl-list">
              {workflowIndex.map((entry) => {
                const isActive = entry.id === activeWorkflowId;
                return (
                  <li
                    key={entry.id}
                    className="fl-list-item"
                    data-testid="workflow-item"
                    data-workflow-id={entry.id}
                    data-active={isActive}
                  >
                    {renamingId === entry.id ? (
                      <input
                        autoFocus
                        type="text"
                        className="fl-input"
                        data-testid="rename-input"
                        aria-label="Workflow name"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(entry.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(entry.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="fl-item-main"
                        aria-label={`Switch to workflow ${entry.name}`}
                        onClick={() => {
                          void switchWorkflow(entry.id).then(() => onClose());
                        }}
                      >
                        <span className="fl-item-name">
                          {entry.name}
                          {isActive && ' (active)'}
                        </span>
                      </button>
                    )}
                    <div className="fl-item-actions">
                      <button
                        type="button"
                        className="fl-icon-btn"
                        data-testid="rename-workflow-button"
                        aria-label={`Rename workflow ${entry.name}`}
                        onClick={() => startRename(entry.id, entry.name)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="fl-icon-btn"
                        data-testid="duplicate-workflow-button"
                        aria-label={`Duplicate workflow ${entry.name}`}
                        onClick={() => {
                          void duplicateWorkflow(entry.id);
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="fl-icon-btn"
                        data-testid="export-workflow-button"
                        aria-label={`Export workflow ${entry.name}`}
                        onClick={() => exportWorkflow(entry.id)}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        className="fl-icon-btn fl-icon-btn-danger"
                        data-testid="delete-workflow-button"
                        aria-label={`Delete workflow ${entry.name}`}
                        onClick={() => setPendingDeleteId(entry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Example workflows">
            <h3 className="fl-section-title">Examples</h3>
            <ul className="fl-list">
              {getExampleWorkflows().map((example) => (
                <li
                  key={example.id}
                  className="fl-list-item"
                  data-testid="example-item"
                  data-example-id={example.id}
                >
                  <div className="fl-item-main">
                    <span className="fl-item-name">{example.name}</span>
                    <span className="fl-item-desc">{example.description}</span>
                  </div>
                  <div className="fl-item-actions">
                    <button
                      type="button"
                      className="fl-btn fl-btn-sm"
                      data-testid={`load-example-${example.id}`}
                      onClick={() => {
                        void loadExample(example.id).then(() => onClose());
                      }}
                    >
                      Load
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete workflow"
        message={`Delete "${pendingDeleteName}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteId) void deleteWorkflow(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

export function WorkflowsDialog(): JSX.Element | null {
  const open = useFlowStore((s) => s.workflowsDialogOpen);
  const setOpen = useFlowStore((s) => s.setWorkflowsDialogOpen);

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

  const close = (): void => setOpen(false);

  return (
    <div
      className="fl-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <WorkflowsDialogContent key={session} onClose={close} />
    </div>
  );
}
