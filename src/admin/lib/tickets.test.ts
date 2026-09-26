import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { fillMacro, slaTone, ticketStatusTone } = await import('./tickets');

describe('saved replies', () => {
  it('fills the customer, ticket and agent', () => {
    expect(fillMacro('Hi {{first_name}}, about {{ticket}}: fixed. — {{ agent }}', { name: 'Lan Nguyen', ticket: 42, agent: 'Mai' }))
      .toBe('Hi Lan, about #42: fixed. — Mai');
  });
  it('leaves nothing behind when the name is unknown', () => {
    expect(fillMacro('Hi {{first_name}}{{name}}!', { name: null, ticket: 1 })).toBe('Hi !');
  });
});

describe('ticket colours', () => {
  it('flags overdue and waiting tickets', () => {
    expect(slaTone('breached')).toBe('crit');
    expect(slaTone('due_soon')).toBe('warn');
    expect(ticketStatusTone('pending')).toBe('warn');
    expect(ticketStatusTone('solved')).toBe('ok');
  });
});
