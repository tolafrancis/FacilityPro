import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { EmptyState, Skeleton } from '../../components/ui';
import { useAdminAction } from '../../lib/tenants';
import { useMacros, type Macro } from '../../lib/tickets';
import { Field } from '../billing/shared';

/** Saved replies: list, add, edit, delete. */
export default function MacrosDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('admin');
  const macros = useMacros();
  const [editing, setEditing] = useState<Macro | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const save = useAdminAction(async () => {
    const row = { title: title.trim(), body: body.trim(), updated_at: new Date().toISOString() };
    const { error } = editing && editing !== 'new'
      ? await supabase.from('fp_ticket_macros').update(row).eq('id', editing.id)
      : await supabase.from('fp_ticket_macros').insert(row);
    if (error) throw error;
  }, t('tickets.toast.macroSaved'));
  const remove = useAdminAction(async (id: string) => {
    const { error } = await supabase.from('fp_ticket_macros').delete().eq('id', id);
    if (error) throw error;
  }, t('tickets.toast.macroDeleted'));
  const open = (m: Macro | 'new') => {
    setEditing(m);
    setTitle(m === 'new' ? '' : m.title);
    setBody(m === 'new' ? '' : m.body);
  };

  return (
    <Modal title={t('tickets.macros')} onClose={onClose} closeLabel={t('close')} wide>
      {editing ? (
        <div className="space-y-3">
          <Field id="mc-title" label={t('tickets.macroTitle')}><Input id="mc-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field id="mc-body" label={t('tickets.macroBody')} hint={t('tickets.macroVars', { first_name: '{{first_name}}', name: '{{name}}', ticket: '{{ticket}}', agent: '{{agent}}', interpolation: { escapeValue: false } })}>
            <textarea id="mc-body" rows={7} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
            <Button disabled={!title.trim() || !body.trim()} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setEditing(null) })}>{t('save')}</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">{t('tickets.macrosHint')}</p>
          {macros.isLoading ? <Skeleton className="h-32" /> : (macros.data ?? []).length === 0 ? (
            <EmptyState title={t('tickets.noMacros')} />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {(macros.data ?? []).map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{m.title}</p>
                    <p className="line-clamp-2 text-xs text-ink-muted">{m.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => open(m)} aria-label={t('tickets.editMacro', { title: m.title })} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink"><Pencil size={14} aria-hidden /></button>
                    <button type="button" onClick={() => remove.mutate(m.id)} aria-label={t('tickets.deleteMacro', { title: m.title })} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-status-crit"><Trash2 size={14} aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end"><Button onClick={() => open('new')}><Plus size={15} aria-hidden /> {t('tickets.newMacro')}</Button></div>
        </>
      )}
    </Modal>
  );
}
