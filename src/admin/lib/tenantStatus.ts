import type { Tone } from '../components/ui';
import type { TenantStatus } from './tenants';

export function tenantStatusTone(s: TenantStatus): Tone {
  switch (s) {
    case 'active':
      return 'ok';
    case 'trial':
      return 'brand';
    case 'past_due':
      return 'warn';
    case 'suspended':
      return 'crit';
    default:
      return 'neutral';
  }
}

/** 0–100 → tone and label key for the health score. */
export function healthTone(score: number): { tone: Tone; key: 'healthy' | 'fair' | 'atRisk' } {
  if (score >= 70) return { tone: 'ok', key: 'healthy' };
  if (score >= 40) return { tone: 'warn', key: 'fair' };
  return { tone: 'crit', key: 'atRisk' };
}
