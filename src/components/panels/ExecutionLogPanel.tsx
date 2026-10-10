import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import './panels.css';

function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function ExecutionLogPanel(): JSX.Element {
  const executionLog = useFlowStore((s) => s.executionLog);
  const executionPhase = useFlowStore((s) => s.executionPhase);
  const lastRunSummary = useFlowStore((s) => s.lastRunSummary);
  const resetExecution = useFlowStore((s) => s.resetExecution);

  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest entries in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [executionLog.length]);

  const canClear = executionLog.length > 0 || executionPhase !== 'idle';
  const summaryText = lastRunSummary
    ? `Finished at ${formatClock(lastRunSummary.at)} — ${
        lastRunSummary.aborted
          ? 'run aborted'
          : lastRunSummary.hasErrors
            ? 'finished with errors'
            : 'completed successfully'
      }`
    : null;

  return (
    <div className="fl-panel" data-testid="execution-log">
      <div className="fl-panel-header">
        <h2 className="fl-panel-title">Execution log</h2>
        <button
          type="button"
          className="fl-btn fl-btn-ghost fl-btn-sm"
          data-testid="clear-log-button"
          disabled={!canClear}
          onClick={() => resetExecution()}
        >
          Clear
        </button>
      </div>
      {executionLog.length === 0 ? (
        <div className="fl-empty">
          <p>Run the workflow to see execution details.</p>
        </div>
      ) : (
        <div className="fl-panel-body">
          <div ref={listRef} className="fl-log" role="log" aria-label="Execution log entries">
            {executionLog.map((entry) => (
              <div
                key={entry.seq}
                data-testid="log-entry"
                data-level={entry.level}
                className={`fl-log-entry fl-log-${entry.level}`}
              >
                <span className="fl-log-time">{formatClock(entry.timestamp)}</span>
                <span className="fl-log-msg">{entry.message}</span>
              </div>
            ))}
          </div>
          {summaryText && <div className="fl-log-summary">{summaryText}</div>}
        </div>
      )}
    </div>
  );
}
