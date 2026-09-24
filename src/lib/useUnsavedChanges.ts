import { useEffect } from 'react';

/**
 * Asks before the tab is closed or reloaded while a form has unsaved
 * changes (audit S4-L1). In-app navigation can't be intercepted with
 * BrowserRouter; pages confirm before discarding edits themselves.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
