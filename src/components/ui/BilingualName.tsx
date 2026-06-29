import { useTranslation } from 'react-i18next';
import Input from './Input';

interface Props {
  en: string;
  vi: string;
  onEn: (v: string) => void;
  onVi: (v: string) => void;
  placeholder?: string;
}

/** EN + VI name inputs for content stored as JSONB name_i18n. */
export default function BilingualName({ en, vi, onEn, onVi, placeholder }: Props) {
  const { t } = useTranslation('common');
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">{t('form.nameEn')}</label>
        <Input value={en} onChange={(e) => onEn(e.target.value)} placeholder={placeholder} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">{t('form.nameVi')}</label>
        <Input value={vi} onChange={(e) => onVi(e.target.value)} />
      </div>
    </div>
  );
}
