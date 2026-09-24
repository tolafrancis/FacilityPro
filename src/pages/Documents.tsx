import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SearchSelect from '../components/ui/SearchSelect';
import { supabase } from '../lib/supabase';
import { formatDateOnly, safeHref } from '../lib/ui';
import { useOrg } from '../contexts/OrgContext';
import {
  useAssets,
  useContracts,
  useDocuments,
  useLocations,
  useOrgDocumentLinks,
  useParts,
  useVendors,
  useWorkOrders,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { DocumentEntityType, DocumentRecord } from '../lib/database.types';
import { signedUrl } from '../lib/media';

const ENTITY_TYPES: DocumentEntityType[] = ['asset', 'work_order', 'vendor', 'contract', 'location', 'part'];

export default function Documents() {
  const { t, i18n } = useTranslation('documents');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg, role } = useOrg();
  // Adding documents is a manager task (RLS enforces it too); everyone else
  // just gets the list of documents they're allowed to see.
  const canManage = role === 'org_admin' || role === 'manager';
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', category: '', owner: '', summary: '', link: '', visibility: 'staff' as DocumentRecord['visibility'] });
  const [file, setFile] = useState<File | null>(null);
  const [linkEntityType, setLinkEntityType] = useState<DocumentEntityType | ''>('');
  const [linkEntityId, setLinkEntityId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const documentsQuery = useDocuments();
  const documents = documentsQuery.data ?? [];
  const linksQuery = useOrgDocumentLinks();
  const links = linksQuery.data ?? [];

  const assets = useAssets().data ?? [];
  const workOrders = useWorkOrders().data ?? [];
  const vendors = useVendors().data ?? [];
  const contracts = useContracts().data ?? [];
  const locations = useLocations().data ?? [];
  const parts = useParts().data ?? [];

  const entityOptions = (type: DocumentEntityType | '') => {
    switch (type) {
      case 'asset':
        return assets.map((a) => ({ id: a.id, label: resolveI18n(a.name_i18n, lng) }));
      case 'work_order':
        return workOrders.map((w) => ({ id: w.id, label: w.title ?? w.id.slice(0, 8) }));
      case 'vendor':
        return vendors.map((v) => ({ id: v.id, label: v.name }));
      case 'contract':
        return contracts.map((c) => ({ id: c.id, label: c.title }));
      case 'location':
        return locations.map((l) => ({ id: l.id, label: resolveI18n(l.name_i18n, lng) }));
      case 'part':
        return parts.map((p) => ({ id: p.id, label: resolveI18n(p.name_i18n, lng) }));
      default:
        return [];
    }
  };

  const entityLabel = (type: string, id: string) => {
    const found = entityOptions(type as DocumentEntityType).find((o) => o.id === id);
    const typeLabel = t(`entity.${type}`, { defaultValue: type });
    return `${typeLabel}: ${found?.label ?? id.slice(0, 8)}`;
  };

  useEffect(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['documents', currentOrg.id] });
  }, [currentOrg?.id, queryClient]);

  // Files are private: open them through a short-lived signed URL, which the
  // storage policy only issues to people allowed to see the document.
  const openAttachment = async (path: string) => {
    const url = await signedUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else setMessage(t('noAccess'));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !form.title) return;
    setBusy(true);
    setMessage(null);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;
      let fileSize: number | null = null;

      if (file) {
        fileName = file.name;
        mimeType = file.type;
        fileSize = file.size;
        // Storage keys must be plain ASCII (Vietnamese file names otherwise fail);
        // the original name is kept in file_name for display.
        const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${currentOrg.id}/documents/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('fp-media').upload(path, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        filePath = path;
      }

      const { data: inserted, error } = await supabase
        .from('fp_documents')
        .insert({
          org_id: currentOrg.id,
          title: form.title,
          category: form.category || t('defaults.category'),
          owner: form.owner || t('defaults.owner'),
          summary: form.summary || null,
          link: form.link || null,
          file_name: fileName,
          file_path: filePath,
          mime_type: mimeType,
          file_size: fileSize,
          visibility: form.visibility,
        })
        .select('id')
        .single();
      if (error) {
        // Don't leave an orphaned file behind a document that wasn't saved.
        if (filePath) await supabase.storage.from('fp-media').remove([filePath]);
        throw error;
      }

      if (linkEntityType && linkEntityId) {
        const { error: linkError } = await supabase.from('fp_document_links').insert({
          org_id: currentOrg.id,
          document_id: inserted.id as string,
          entity_type: linkEntityType,
          entity_id: linkEntityId,
        });
        if (linkError) throw linkError;
      }

      setForm({ title: '', category: '', owner: '', summary: '', link: '', visibility: 'staff' });
      setFile(null);
      setLinkEntityType('');
      setLinkEntityId('');
      setMessage(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['documents', currentOrg.id] });
      await queryClient.invalidateQueries({ queryKey: ['document_links_all', currentOrg.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {t('subtitle')}
        </p>
      </div>

      <div className={canManage ? 'grid gap-6 lg:grid-cols-[0.95fr_1.05fr]' : 'max-w-3xl'}>
        {canManage && (
        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">{t('add')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.title')}</label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('fields.titlePlaceholder')} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('fields.category')}</label>
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder={t('fields.categoryPlaceholder')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('fields.owner')}</label>
                <Input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder={t('fields.ownerPlaceholder')} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.summary')}</label>
              <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} rows={4} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder={t('fields.summaryPlaceholder')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.link')}</label>
              <Input value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} placeholder={t('fields.linkPlaceholder')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.file')}</label>
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-full file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand" />
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-sm font-medium text-ink">{t('linkRecord')}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{t('linkRecordHint')}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={linkEntityType}
                  onChange={(event) => {
                    setLinkEntityType(event.target.value as DocumentEntityType | '');
                    setLinkEntityId('');
                  }}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  <option value="">{t('noLink')}</option>
                  {ENTITY_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`entity.${type}`)}</option>
                  ))}
                </select>
                {linkEntityType && (
                  <SearchSelect
                    value={linkEntityId}
                    onChange={setLinkEntityId}
                    options={entityOptions(linkEntityType)}
                    placeholder={t('search')}
                    emptyLabel={t('none')}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.visibility')}</label>
              <select
                value={form.visibility}
                onChange={(event) => setForm({ ...form, visibility: event.target.value as DocumentRecord['visibility'] })}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="staff">{t('visibility.staffLong')}</option>
                <option value="everyone">{t('visibility.everyoneLong')}</option>
              </select>
            </div>
            <Button type="submit" loading={busy}>{t('save')}</Button>
            {message && <p className="text-sm text-brand">{message}</p>}
          </div>
        </form>
        )}

        <div className="space-y-4">
          {documents.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
              {t('empty')}
            </div>
          )}
          {documents.map((doc) => {
            const docLinks = links.filter((l) => l.document_id === doc.id);
            return (
              <div key={doc.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">{doc.title}</h3>
                    <p className="text-sm text-ink-muted">{doc.category} · {doc.owner}</p>
                  </div>
                  <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{formatDateOnly(doc.created_at, lng)}</span>
                </div>
                {doc.summary && <p className="mt-3 text-sm text-ink-muted">{doc.summary}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {doc.link && /^https?:\/\//i.test(doc.link) && (
                    <a href={safeHref(doc.link)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand">
                      {t('openReference')}
                    </a>
                  )}
                  {doc.file_path && (
                    <button
                      type="button"
                      onClick={() => void openAttachment(doc.file_path!)}
                      className="font-medium text-brand hover:text-brand-600"
                    >
                      {t('download', { name: doc.file_name ?? t('attachment') })}
                    </button>
                  )}
                  {canManage && (
                    <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-ink-muted">
                      {doc.visibility === 'everyone' ? t('visibility.everyone') : t('visibility.staff')}
                    </span>
                  )}
                </div>
                {docLinks.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {docLinks.map((l) => (
                      <span key={l.id} className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink-muted">
                        {entityLabel(l.entity_type, l.entity_id)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
