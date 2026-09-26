import type { Role } from '../lib/database.types';

// Steps of the guided tour. `target` is a data-tour="…" attribute on the
// screen; a step whose target isn't visible (e.g. the side menu on a phone)
// is shown in the middle of the screen instead. Text: help.json → tour.steps.

export interface TourStep {
  id: string;
  target?: string;
}

export function tourSteps(role: Role | null): TourStep[] {
  if (role === 'occupant') {
    return [
      { id: 'welcomeTenant' },
      { id: 'reportFault', target: 'report-fault' },
      { id: 'myRequests', target: 'nav-myRequests' },
      { id: 'bell', target: 'bell' },
      { id: 'language', target: 'language' },
      { id: 'help', target: 'help' },
      { id: 'finish' },
    ];
  }
  const steps: TourStep[] = [{ id: 'welcome' }, { id: 'menu', target: 'nav' }];
  if (role === 'technician') {
    steps.push({ id: 'myWork', target: 'nav-myWork' });
  } else {
    steps.push({ id: 'stats', target: 'stats' }, { id: 'create', target: 'create' });
  }
  steps.push(
    { id: 'org', target: 'org' },
    { id: 'bell', target: 'bell' },
    { id: 'language', target: 'language' },
    { id: 'help', target: 'help' },
    { id: 'finish' }
  );
  return steps;
}
