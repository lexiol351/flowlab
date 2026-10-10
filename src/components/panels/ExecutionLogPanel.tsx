import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import type { LogLevel } from '../../lib/workflow/engine.ts';
import './panels.css';

const LEVELS: Array<LogLevel | 'all'> = ['all', 'info', 'warn', 'error'];

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
  const exportExecutionLog = useFlowStore((s) => s.exportExecutionLog);

  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [textFilter, setTextFilter] = useState('');

  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest entries in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [executionLog.length]);

  const canClear = executionLog.length > 0 || executionPhase !== 'idle';
  const normalized = textFilter.trim().toLowerCase();
  const visibleEntries = executionLog.filter(
    (entry) =>
      (levelFilter === 'all' || entry.level === levelFilter) &&
      (normalized === '' || entry.message.toLowerCase().includes(normalized)),
  );
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
        <div className="fl-btn-row">
          <button
            type="button"
            className="fl-btn fl-btn-ghost fl-btn-sm"
            data-testid="export-log-button"
            disabled={executionLog.length === 0}
            onClick={() => exportExecutionLog()}
            title="Download the log as JSON"
          >
            Export
          </button>
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
      </div>
      {executionLog.length > 0 && (
        <div className="fl-log-filters">
          <div className="fl-log-levels" role="group" aria-label="Filter by level">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={`fl-log-level${levelFilter === level ? ' is-active' : ''}`}
                data-testid={`log-filter-${level}`}
                aria-pressed={levelFilter === level}
                onClick={() => setLevelFilter(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="fl-input fl-log-search"
            data-testid="log-search"
            aria-label="Search log entries"
            placeholder="Search log…"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
        </div>
      )}
      {executionLog.length === 0 ? (
        <div className="fl-empty">
          <p>Run the workflow to see execution details.</p>
        </div>
      ) : (
        <div className="fl-panel-body">
          <div ref={listRef} className="fl-log" role="log" aria-label="Execution log entries">
            {visibleEntries.length === 0 && (
              <div className="fl-empty">
                <p>No entries match the current filters.</p>
              </div>
            )}
            {visibleEntries.map((entry) => (
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
