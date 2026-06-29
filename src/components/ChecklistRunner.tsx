import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { writeOrQueue } from '../lib/sync';
import { useAuth } from '../contexts/AuthContext';
import { useChecklistItems, useChecklistRun } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { ChecklistResult } from '../lib/database.types';
import { formatDate } from '../lib/ui';
import Button from './ui/Button';
import Input from './ui/Input';

interface Props {
  orgId: string;
  workOrderId: string;
  templateId: string;
}

type Results = Record<string, ChecklistResult>;

export default function ChecklistRunner({ orgId, workOrderId, templateId }: Props) {
  const { t, i18n } = useTranslation('checklists');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const itemsQuery = useChecklistItems(templateId);
  const runQuery = useChecklistRun(workOrderId);
  const [results, setResults] = useState<Results>({});

  useEffect(() => {
    if (runQuery.data?.results) setResults(runQuery.data.results);
  }, [runQuery.data]);

  const items = itemsQuery.data ?? [];
  const run = runQuery.data;

  const setResult = (itemId: string, patch: Partial<ChecklistResult>) =>
    setResults((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

  const requiredDone = items
    .filter((i) => i.required)
    .every((i) => {
      const r = results[i.id];
      if (!r) return false;
      return r.status === 'pass' || r.status === 'done' || (r.value ?? '') !== '';
    });

  const save = useMutation({
    mutationFn: async () => {
      const completed_at = requiredDone ? new Date().toISOString() : null;
      if (run) {
        await writeOrQueue({
          op: 'update',
          table: 'fp_checklist_runs',
          values: { results, completed_at },
          matchColumn: 'id',
          matchValue: run.id,
        });
      } else {
        await writeOrQueue({
          op: 'insert',
          table: 'fp_checklist_runs',
          values: {
            org_id: orgId,
            template_id: templateId,
            work_order_id: workOrderId,
            performed_by: user?.id ?? null,
            results,
            completed_at,
          },
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist_run', workOrderId] }),
  });

  if (items.length === 0) return null;

  return (
    <div className="mt-5 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{t('runner.title')}</p>
        {run?.completed_at && (
          <span className="text-xs text-status-ok">
            {t('runner.completed', { when: formatDate(run.completed_at, lng) })}
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const r = results[item.id] ?? {};
          return (
            <li key={item.id} className="rounded-lg border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">
                  {resolveI18n(item.label_i18n, lng)}
                  {item.required && <span className="ml-1 text-status-crit">*</span>}
                </span>

                {item.item_type === 'pass_fail' && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setResult(item.id, { status: 'pass' })}
                      className={`grid h-7 w-7 place-items-center rounded-md border ${
                        r.status === 'pass'
                          ? 'border-status-ok bg-status-ok/10 text-status-ok'
                          : 'border-line text-ink-muted'
                      }`}
                      aria-label={t('runner.pass')}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setResult(item.id, { status: 'fail' })}
                      className={`grid h-7 w-7 place-items-center rounded-md border ${
                        r.status === 'fail'
                          ? 'border-status-crit bg-status-crit/10 text-status-crit'
                          : 'border-line text-ink-muted'
                      }`}
                      aria-label={t('runner.fail')}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}

                {item.item_type === 'photo' && (
                  <button
                    type="button"
                    onClick={() =>
                      setResult(item.id, { status: r.status === 'done' ? undefined : 'done' })
                    }
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      r.status === 'done'
                        ? 'border-status-ok bg-status-ok/10 text-status-ok'
                        : 'border-line text-ink-muted'
                    }`}
                  >
                    {t('runner.done')}
                  </button>
                )}
              </div>

              {(item.item_type === 'value' || item.item_type === 'text') && (
                <Input
                  className="mt-2"
                  value={r.value ?? ''}
                  onChange={(e) => setResult(item.id, { value: e.target.value })}
                  placeholder={
                    item.item_type === 'value'
                      ? t('runner.valuePlaceholder')
                      : t('runner.notePlaceholder')
                  }
                />
              )}

              {item.item_type === 'photo' && (
                <p className="mt-1 text-xs text-ink-muted">{t('runner.photoHint')}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          {t('runner.save')}
        </Button>
      </div>
    </div>
  );
}
