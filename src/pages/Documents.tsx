import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SearchSelect from '../components/ui/SearchSelect';
import { supabase } from '../lib/supabase';
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
import type { DocumentEntityType } from '../lib/database.types';

const ENTITY_TYPES: { value: DocumentEntityType; label: string }[] = [
  { value: 'asset', label: 'Asset' },
  { value: 'work_order', label: 'Work order' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'contract', label: 'Contract' },
  { value: 'location', label: 'Location' },
  { value: 'part', label: 'Part' },
];

export default function Documents() {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', category: '', owner: '', summary: '', link: '' });
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
        return assets.map((a) => ({ id: a.id, label: resolveI18n(a.name_i18n, 'en') }));
      case 'work_order':
        return workOrders.map((w) => ({ id: w.id, label: w.title ?? w.id.slice(0, 8) }));
      case 'vendor':
        return vendors.map((v) => ({ id: v.id, label: v.name }));
      case 'contract':
        return contracts.map((c) => ({ id: c.id, label: c.title }));
      case 'location':
        return locations.map((l) => ({ id: l.id, label: resolveI18n(l.name_i18n, 'en') }));
      case 'part':
        return parts.map((p) => ({ id: p.id, label: resolveI18n(p.name_i18n, 'en') }));
      default:
        return [];
    }
  };

  const entityLabel = (type: string, id: string) => {
    const found = entityOptions(type as DocumentEntityType).find((o) => o.id === id);
    const typeLabel = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type;
    return `${typeLabel}: ${found?.label ?? id.slice(0, 8)}`;
  };

  useEffect(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['documents', currentOrg.id] });
  }, [currentOrg?.id, queryClient]);

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
        const path = `${currentOrg.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('fp-media').upload(path, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        filePath = path;
      }

      const { data: inserted, error } = await supabase
        .from('fp_documents')
        .insert({
          org_id: currentOrg.id,
          title: form.title,
          category: form.category || 'General',
          owner: form.owner || 'Operations',
          summary: form.summary || null,
          link: form.link || null,
          file_name: fileName,
          file_path: filePath,
          mime_type: mimeType,
          file_size: fileSize,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (linkEntityType && linkEntityId) {
        const { error: linkError } = await supabase.from('fp_document_links').insert({
          org_id: currentOrg.id,
          document_id: inserted.id as string,
          entity_type: linkEntityType,
          entity_id: linkEntityId,
        });
        if (linkError) throw linkError;
      }

      setForm({ title: '', category: '', owner: '', summary: '', link: '' });
      setFile(null);
      setLinkEntityType('');
      setLinkEntityId('');
      setMessage('Document saved successfully.');
      await queryClient.invalidateQueries({ queryKey: ['documents', currentOrg.id] });
      await queryClient.invalidateQueries({ queryKey: ['document_links_all', currentOrg.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save document.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Document repository</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Keep SOPs, manuals, and site guides in one place so technicians can access the correct document when they need it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Add a document</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Title</label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Boiler room SOP" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Category</label>
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Safety" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Owner</label>
                <Input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="Facilities team" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Summary</label>
              <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} rows={4} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Describe the latest revision and who should use it." />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Link or reference</label>
              <Input value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} placeholder="https://... or SharePoint folder" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Upload file</label>
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-full file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand" />
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-sm font-medium text-ink">Link to a record (optional)</p>
              <p className="mt-0.5 text-xs text-ink-muted">So this document shows up on the asset, vendor, or work order it actually belongs to.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={linkEntityType}
                  onChange={(event) => {
                    setLinkEntityType(event.target.value as DocumentEntityType | '');
                    setLinkEntityId('');
                  }}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  <option value="">No link</option>
                  {ENTITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {linkEntityType && (
                  <SearchSelect
                    value={linkEntityId}
                    onChange={setLinkEntityId}
                    options={entityOptions(linkEntityType)}
                    placeholder="Search…"
                    emptyLabel="None"
                  />
                )}
              </div>
            </div>
            <Button type="submit" loading={busy}>Save document</Button>
            {message && <p className="text-sm text-brand">{message}</p>}
          </div>
        </form>

        <div className="space-y-4">
          {documents.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
              No documents added yet. Start by uploading a guide or linking to an internal folder.
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
                  <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{new Date(doc.created_at).toLocaleDateString()}</span>
                </div>
                {doc.summary && <p className="mt-3 text-sm text-ink-muted">{doc.summary}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {doc.link && (
                    <a href={doc.link} target="_blank" rel="noreferrer" className="font-medium text-brand">
                      Open reference
                    </a>
                  )}
                  {doc.file_name && (
                    <span className="text-ink-muted">Attachment: {doc.file_name}</span>
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
