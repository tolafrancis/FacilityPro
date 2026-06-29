import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ListChecks, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useChecklistTemplates } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import Button from '../components/ui/Button';
import BilingualName from '../components/ui/BilingualName';

export default function Checklists() {
  const { t, i18n } = useTranslation('checklists');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const templates = useChecklistTemplates();
  const [open, setOpen] = useState(false);

  const add = useMutation({
    mutationFn: async (v: { en: string; vi: string }) => {
      const { data, error } = await supabase
        .from('fp_checklist_templates')
        .insert({ org_id: orgId, name_i18n: { en: v.en, vi: v.vi || v.en } })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_templates', orgId] });
      setOpen(false);
      navigate(`/checklists/${id}`);
    },
  });

  const rows = templates.data ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> {t('addTemplate')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <ListChecks className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => navigate(`/checklists/${tpl.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-4 py-3 text-left hover:bg-surface"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <ListChecks size={16} className="text-ink-muted" aria-hidden />
                  {resolveI18n(tpl.name_i18n, lng)}
                </span>
                <ChevronRight size={16} className="text-ink-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <TemplateDialog
          busy={add.isPending}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => add.mutate(v)}
          title={t('newTemplateTitle')}
          saveLabel={tc('actions.create')}
          cancelLabel={tc('actions.cancel')}
        />
      )}
    </div>
  );
}

function TemplateDialog({
  busy,
  onCancel,
  onSubmit,
  title,
  saveLabel,
  cancelLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { en: string; vi: string }) => void;
  title: string;
  saveLabel: string;
  cancelLabel: string;
}) {
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi });
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" loading={busy}>
            {saveLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
