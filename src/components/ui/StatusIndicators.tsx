import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';

export function StatusIndicators(): JSX.Element {
  const online = useFlowStore((s) => s.online);
  const updateAvailable = useFlowStore((s) => s.updateAvailable);
  const applyUpdate = useFlowStore((s) => s.applyUpdate);

  if (online && !updateAvailable) {
    return <div className="status-indicators" aria-hidden="true" />;
  }

  return (
    <div className="status-indicators">
      {!online && (
        <div
          className="offline-indicator"
          data-testid="offline-indicator"
          role="status"
        >
          You are offline. Your workflows are saved locally and remain usable.
        </div>
      )}
      {updateAvailable && (
        <div className="update-banner" data-testid="update-banner" role="status">
          <span>A new version is available.</span>
          <button
            type="button"
            className="btn"
            data-testid="update-apply"
            onClick={applyUpdate}
          >
            Update
          </button>
        </div>
      )}
    </div>
  );
}
