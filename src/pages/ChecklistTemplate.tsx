import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useChecklistItems, useChecklistTemplate } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { ChecklistItemType } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

const ITEM_TYPES: ChecklistItemType[] = ['pass_fail', 'value', 'photo', 'text'];

export default function ChecklistTemplate() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('checklists');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();

  const tplQuery = useChecklistTemplate(id);
  const itemsQuery = useChecklistItems(id);
  const items = itemsQuery.data ?? [];

  const [labelEn, setLabelEn] = useState('');
  const [labelVi, setLabelVi] = useState('');
  const [type, setType] = useState<ChecklistItemType>('pass_fail');
  const [required, setRequired] = useState(true);

  const addItem = useMutation({
    mutationFn: async () => {
      const nextOrd = items.length ? Math.max(...items.map((i) => i.ord)) + 1 : 0;
      const { error } = await supabase.from('fp_checklist_items').insert({
        org_id: orgId,
        template_id: id,
        ord: nextOrd,
        label_i18n: { en: labelEn, vi: labelVi || labelEn },
        item_type: type,
        required,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_items', id] });
      setLabelEn('');
      setLabelVi('');
      setType('pass_fail');
      setRequired(true);
    },
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('fp_checklist_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist_items', id] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!labelEn) return;
    addItem.mutate();
  };

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={() => navigate('/checklists')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {t('title')}
      </button>

      <h1 className="text-2xl font-semibold text-ink">
        {tplQuery.data ? resolveI18n(tplQuery.data.name_i18n, lng) : tc('loading')}
      </h1>

      <p className="mt-5 text-sm font-medium text-ink">{t('items')}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2"
          >
            <span className="text-sm text-ink">
              {resolveI18n(item.label_i18n, lng)}
              <span className="ml-2 text-xs text-ink-muted">
                {t(`types.${item.item_type}`)}
                {item.required ? ` · ${t('required')}` : ''}
              </span>
            </span>
            <button
              type="button"
              onClick={() => removeItem.mutate(item.id)}
              className="text-ink-muted hover:text-status-crit"
              aria-label={t('delete')}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-ink-muted">{t('noItems')}</li>}
      </ul>

      <form onSubmit={submit} className="mt-5 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-medium text-ink">{t('addItem')}</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('itemLabelEn')}</label>
            <Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('itemLabelVi')}</label>
            <Input value={labelVi} onChange={(e) => setLabelVi(e.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-ink">{t('type')}</label>
              <Select value={type} onChange={(e) => setType(e.target.value as ChecklistItemType)}>
                {ITEM_TYPES.map((it) => (
                  <option key={it} value={it}>
                    {t(`types.${it}`)}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
              />
              {t('required')}
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={addItem.isPending}>
            <Plus size={16} /> {t('addItem')}
          </Button>
        </div>
      </form>
    </div>
  );
}
