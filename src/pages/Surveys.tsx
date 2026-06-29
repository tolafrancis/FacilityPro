import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Trash2, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useSurveys } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { Survey } from '../lib/database.types';
import Button from '../components/ui/Button';
import BilingualName from '../components/ui/BilingualName';

interface DraftValue {
  en: string;
  vi: string;
  questions: string[];
}

export default function Surveys() {
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const surveys = useSurveys();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; survey: Survey } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['surveys', orgId] });

  const create = useMutation({
    mutationFn: async (v: DraftValue) => {
      const { error } = await supabase.from('fp_surveys').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        questions: v.questions,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
      setDialog(null);
    },
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; v: DraftValue }) => {
      const { error } = await supabase
        .from('fp_surveys')
        .update({ name_i18n: { en: args.v.en, vi: args.v.vi || args.v.en }, questions: args.v.questions })
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
      setDialog(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_surveys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const rows = surveys.data ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Surveys</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Feedback questionnaires sent to requestors — used by the &ldquo;Send Survey to Requestor&rdquo; workflow action.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus size={16} /> New survey
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Star className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">No surveys yet. Create one to use in a workflow.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Star size={16} className="text-ink-muted" aria-hidden />
                {resolveI18n(s.name_i18n, lng)}
                <span className="text-xs font-normal text-ink-muted">
                  {s.questions.length} {s.questions.length === 1 ? 'question' : 'questions'}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDialog({ mode: 'edit', survey: s })}
                  className="text-ink-muted hover:text-brand"
                  aria-label={tc('actions.edit')}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(s.id)}
                  className="text-ink-muted hover:text-status-crit"
                  aria-label={tc('actions.cancel')}
                >
                  <Trash2 size={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <SurveyDialog
          title={dialog.mode === 'create' ? 'New survey' : 'Edit survey'}
          initial={dialog.mode === 'edit' ? dialog.survey : null}
          busy={create.isPending || update.isPending}
          saveLabel={tc('actions.save')}
          cancelLabel={tc('actions.cancel')}
          onCancel={() => setDialog(null)}
          onSubmit={(v) =>
            dialog.mode === 'edit' ? update.mutate({ id: dialog.survey.id, v }) : create.mutate(v)
          }
        />
      )}
    </div>
  );
}

function SurveyDialog({
  title,
  initial,
  busy,
  saveLabel,
  cancelLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: Survey | null;
  busy: boolean;
  saveLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (v: DraftValue) => void;
}) {
  const [en, setEn] = useState(initial?.name_i18n.en ?? '');
  const [vi, setVi] = useState(initial?.name_i18n.vi ?? '');
  const [questionsText, setQuestionsText] = useState((initial?.questions ?? []).join('\n'));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    const questions = questionsText
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);
    onSubmit({ en, vi, questions });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Questions</label>
            <textarea
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              rows={5}
              placeholder={'One question per line\nHow satisfied were you?\nAny additional comments?'}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <p className="mt-1 text-xs text-ink-muted">One question per line.</p>
          </div>
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
