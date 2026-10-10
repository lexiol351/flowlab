import { createContext, useContext } from 'react';

export interface DragHandleInfo {
  nodeId: string;
  handleId: string | null;
  kind: 'source' | 'target';
}

/** Which handle a connection drag started from, if any (for highlight). */
export const DragHandleContext = createContext<DragHandleInfo | null>(null);

export function useDragHandle(): DragHandleInfo | null {
  return useContext(DragHandleContext);
}
