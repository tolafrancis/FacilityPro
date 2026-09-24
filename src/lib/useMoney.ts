import { useTranslation } from 'react-i18next';
import { useOrg } from '../contexts/OrgContext';
import { formatMoney } from './ui';

/** Formats amounts in the current organisation's currency and the UI language. */
export function useMoney(opts: { whole?: boolean } = {}) {
  const { currency } = useOrg();
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  return (value: number | null | undefined) => formatMoney(value, currency, lng, opts);
}
