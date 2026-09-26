import { describe, expect, it } from 'vitest';
import { errorPayload } from './monitoring';

describe('errorPayload', () => {
  it('takes the message and stack of an Error', () => {
    const e = new TypeError('x is undefined');
    const p = errorPayload(e);
    expect(p?.message).toBe('x is undefined');
    expect(p?.stack).toContain('x is undefined');
  });
  it('prefixes database error codes and handles plain objects', () => {
    expect(errorPayload({ code: '57014', message: 'canceling statement due to statement timeout' })?.message)
      .toBe('[57014] canceling statement due to statement timeout');
    expect(errorPayload({ status: 500 })?.message).toBe('{"status":500}');
  });
  it('uses the component stack for render errors without a stack', () => {
    expect(errorPayload({ message: 'boom' }, { componentStack: '\n    at Page' })?.stack).toBe('\n    at Page');
  });
  it('drops noise and empty errors', () => {
    expect(errorPayload(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBeNull();
    expect(errorPayload(new DOMException('The user aborted a request.', 'AbortError'))).toBeNull();
    expect(errorPayload(null)).toBeNull();
    expect(errorPayload({})).toBeNull();
    expect(errorPayload('   ')).toBeNull();
  });
  it('caps the message length', () => {
    expect(errorPayload('x'.repeat(2000))?.message).toHaveLength(500);
  });
});
