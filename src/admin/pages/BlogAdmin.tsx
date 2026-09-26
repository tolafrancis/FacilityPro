import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bold, ExternalLink, Eye, Heading2, ImagePlus, Italic, Link2, List, Newspaper, Pencil, Plus, Quote, Trash2, Upload, X } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, type Tone } from '../components/ui';
import Button from '../../components/ui/Button';
import { notify } from '../../components/Toaster';
import { Markdown } from '../../lib/markdown';
import { blogImageUrl, isLive, slugify, uploadBlogImage, useAdminPost, useAllPosts, type BlogPost } from '../../lib/blog';
import { adminErrorMessage, rpc, useAdminAction } from '../lib/tenants';
import { timeAgo } from '../lib/format';
import { ConfirmDialog, IconButton } from './TenantDetail';
import { Field, control } from './billing/shared';

type ListPost = Omit<BlogPost, 'body' | 'seo_title' | 'seo_description'>;

function state(p: Pick<BlogPost, 'status' | 'published_at'>): { key: 'draft' | 'scheduled' | 'published'; tone: Tone } {
  if (p.status === 'draft') return { key: 'draft', tone: 'neutral' };
  return isLive(p) ? { key: 'published', tone: 'ok' } : { key: 'scheduled', tone: 'info' };
}

/** /admin/blog: every post, newest edits first. */
export default function BlogAdmin() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useAllPosts();
  const [deleting, setDeleting] = useState<ListPost | null>(null);
  const remove = useAdminAction((id: string) => rpc('fp_admin_delete_blog_post', { p_id: id }), t('blog.toast.deleted'));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('nav.items.blog')} description={t('blog.subtitle')}
        actions={<>
          <a href="/blog" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"><ExternalLink size={15} aria-hidden /> {t('blog.viewBlog')}</a>
          <Link to="/admin/blog/new"><Button><Plus size={16} aria-hidden /> {t('blog.new')}</Button></Link>
        </>} />
      {q.isError ? <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /> : !q.data ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : q.data.length === 0 ? (
        <EmptyState icon={Newspaper} title={t('blog.empty')} body={t('blog.emptyHint')}
          action={<Link to="/admin/blog/new"><Button><Plus size={16} aria-hidden /> {t('blog.new')}</Button></Link>} />
      ) : (
        <Card>
          <ul className="-my-2 divide-y divide-line">
            {q.data.map((p) => {
              const s = state(p);
              const cover = blogImageUrl(p.cover_path);
              return (
                <li key={p.id} className="flex items-center gap-4 py-3">
                  <div className="hidden h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-brand/5 sm:block">
                    {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-brand/40"><Newspaper size={20} aria-hidden /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/blog/${p.id}`} className="font-medium text-ink hover:underline">{p.title}</Link>
                    <p className="truncate text-xs text-ink-muted">
                      /blog/{p.slug} · {s.key === 'draft' ? t('blog.edited', { when: timeAgo(p.updated_at, lng) })
                        : t(s.key === 'scheduled' ? 'blog.scheduledFor' : 'blog.publishedOn', { date: new Date(p.published_at!).toLocaleString(lng, { dateStyle: 'medium', timeStyle: 'short' }) })}
                      {p.tags.length > 0 && ` · ${p.tags.join(', ')}`}
                    </p>
                  </div>
                  <Badge tone={s.tone}>{t(`blog.state.${s.key}`)}</Badge>
                  <div className="inline-flex">
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" title={t('blog.view')} aria-label={t('blog.view')} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink"><Eye size={15} aria-hidden /></a>
                    <Link to={`/admin/blog/${p.id}`} title={t('blog.edit')} aria-label={t('blog.edit')} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink"><Pencil size={15} aria-hidden /></Link>
                    <IconButton danger label={t('blog.delete')} onClick={() => setDeleting(p)}><Trash2 size={15} /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {deleting && (
        <ConfirmDialog danger title={t('blog.delete')} confirmLabel={t('blog.delete')} busy={remove.isPending}
          body={t('blog.deleteBody', { title: deleting.title })} onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })} />
      )}
    </div>
  );
}

interface Draft {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover_path: string | null;
  tags: string[];
  author_name: string;
  status: 'draft' | 'published';
  published_at: string; // datetime-local value, '' = now
  seo_title: string;
  seo_description: string;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** /admin/blog/new and /admin/blog/:id */
export function BlogEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const q = useAdminPost(isNew ? undefined : id);
  const { t } = useTranslation('admin');
  if (!isNew && q.isError) return <div className="mx-auto max-w-5xl"><ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /></div>;
  if (!isNew && !q.data) return <div className="mx-auto max-w-5xl space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96" /></div>;
  const p = q.data;
  return (
    <EditorForm key={p?.id ?? 'new'} initial={p ? {
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt ?? '', body: p.body, cover_path: p.cover_path, tags: p.tags,
      author_name: p.author_name ?? '', status: p.status, published_at: toLocalInput(p.published_at),
      seo_title: p.seo_title ?? '', seo_description: p.seo_description ?? '',
    } : {
      title: '', slug: '', excerpt: '', body: '', cover_path: null, tags: [], author_name: '', status: 'draft', published_at: '',
      seo_title: '', seo_description: '',
    }} />
  );
}

function EditorForm({ initial }: { initial: Draft }) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'cover' | 'inline' | null>(null);
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const inlineInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setDirty(true);
    setError(null);
  };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onTitle = (v: string) => {
    set('title', v);
    if (!slugTouched) setD((x) => ({ ...x, title: v, slug: slugify(v) }));
  };

  // Toolbar: wrap the selection or insert at the cursor.
  const edit = (before: string, after = '', placeholder = '') => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    set('body', next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const line = (prefix: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const s = el.selectionStart;
    const start = el.value.lastIndexOf('\n', s - 1) + 1;
    set('body', el.value.slice(0, start) + prefix + el.value.slice(start));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>, kind: 'cover' | 'inline') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(kind);
    try {
      const path = await uploadBlogImage(file);
      if (kind === 'cover') set('cover_path', path);
      else edit(`\n![${file.name.replace(/\.[^.]+$/, '')}](${blogImageUrl(path)})\n`);
    } catch (err) {
      const code = (err as Error).message;
      notify(code === 'blog_image_type' || code === 'blog_image_size' ? t(`blog.errors.${code}`) : adminErrorMessage(err), 'error');
    }
    setUploading(null);
  };

  const addTag = () => {
    const v = tagInput.trim().toLowerCase().replace(/,$/, '');
    if (v && !d.tags.includes(v) && d.tags.length < 10) set('tags', [...d.tags, v]);
    setTagInput('');
  };

  const save = async (status: 'draft' | 'published') => {
    if (!d.title.trim()) return setError(t('blog.errors.title'));
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)) return setError(t('blog.errors.slug'));
    setBusy(true);
    try {
      const saved = await rpc<BlogPost>('fp_admin_save_blog_post', {
        p: { ...d, status, published_at: d.published_at ? new Date(d.published_at).toISOString() : null },
      });
      setDirty(false);
      for (const k of ['admin_blog_posts', 'admin_blog_post', 'blog_posts', 'blog_post']) void qc.invalidateQueries({ queryKey: [k] });
      notify(t(status === 'draft' ? 'blog.toast.draft' : isLive(saved) ? 'blog.toast.published' : 'blog.toast.scheduled'), 'success');
      if (!d.id) navigate(`/admin/blog/${saved.id}`, { replace: true });
      else setD((x) => ({ ...x, status: saved.status, published_at: toLocalInput(saved.published_at) }));
    } catch (err) {
      setError((err as { message?: string }).message === 'blog_slug_taken' ? t('blog.errors.slugTaken') : adminErrorMessage(err));
    }
    setBusy(false);
  };

  const cover = blogImageUrl(d.cover_path);
  const live = d.id && isLive({ status: d.status, published_at: d.published_at ? new Date(d.published_at).toISOString() : null });
  const tool = 'grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink';

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/blog" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> {t('nav.items.blog')}</Link>
      <PageHeader title={d.id ? t('blog.editTitle') : t('blog.new')}
        actions={<>
          {d.id && <a href={`/blog/${d.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"><ExternalLink size={15} aria-hidden /> {live ? t('blog.view') : t('blog.previewLink')}</a>}
          <Button variant="secondary" loading={busy} onClick={() => void save('draft')}>{d.status === 'published' ? t('blog.unpublish') : t('blog.saveDraft')}</Button>
          <Button loading={busy} onClick={() => void save('published')}>{d.status === 'published' ? t('blog.update') : d.published_at && new Date(d.published_at) > new Date() ? t('blog.schedule') : t('blog.publish')}</Button>
        </>} />
      {error && <p role="alert" className="mb-4 rounded-lg border border-status-crit/30 bg-status-crit/5 p-3 text-sm text-status-crit">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <div className="space-y-4">
              <Field id="bp-title" label={t('blog.fields.title')}>
                <input id="bp-title" value={d.title} onChange={(e) => onTitle(e.target.value)} maxLength={200} className={`${control} h-11 w-full text-lg font-medium`} placeholder={t('blog.fields.titlePh')} />
              </Field>
              <Field id="bp-excerpt" label={t('blog.fields.excerpt')} hint={t('blog.fields.excerptHint')}>
                <textarea id="bp-excerpt" value={d.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={400} rows={2} className={`${control} h-auto w-full py-2`} />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" className="inline-flex rounded-md border border-line p-0.5">
                {(['write', 'preview'] as const).map((x) => (
                  <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
                    className={`rounded px-3 py-1 text-sm ${tab === x ? 'bg-ink/10 font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}>{t(`blog.tabs.${x}`)}</button>
                ))}
              </div>
              {tab === 'write' && (
                <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={t('blog.toolbar')}>
                  <button type="button" className={tool} title={t('blog.tools.heading')} aria-label={t('blog.tools.heading')} onClick={() => line('## ')}><Heading2 size={16} /></button>
                  <button type="button" className={tool} title={t('blog.tools.bold')} aria-label={t('blog.tools.bold')} onClick={() => edit('**', '**', t('blog.tools.bold'))}><Bold size={16} /></button>
                  <button type="button" className={tool} title={t('blog.tools.italic')} aria-label={t('blog.tools.italic')} onClick={() => edit('*', '*', t('blog.tools.italic'))}><Italic size={16} /></button>
                  <button type="button" className={tool} title={t('blog.tools.link')} aria-label={t('blog.tools.link')} onClick={() => edit('[', '](https://)', t('blog.tools.linkText'))}><Link2 size={16} /></button>
                  <button type="button" className={tool} title={t('blog.tools.list')} aria-label={t('blog.tools.list')} onClick={() => line('- ')}><List size={16} /></button>
                  <button type="button" className={tool} title={t('blog.tools.quote')} aria-label={t('blog.tools.quote')} onClick={() => line('> ')}><Quote size={16} /></button>
                  <button type="button" className={tool} title={t('blog.tools.image')} aria-label={t('blog.tools.image')} disabled={!!uploading} onClick={() => inlineInput.current?.click()}><ImagePlus size={16} /></button>
                  <input ref={inlineInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void upload(e, 'inline')} />
                </div>
              )}
            </div>
            {tab === 'write' ? (
              <>
                <textarea ref={bodyRef} aria-label={t('blog.fields.body')} value={d.body} onChange={(e) => set('body', e.target.value)}
                  rows={22} className={`${control} h-auto min-h-[28rem] w-full py-3 font-mono text-[14px] leading-6`} placeholder={t('blog.fields.bodyPh')} />
                <p className="mt-2 text-xs text-ink-muted">{t('blog.markdownHelp')}</p>
              </>
            ) : (
              <div className="min-h-[28rem] rounded-lg border border-line bg-white p-6">
                {d.title && <h1 className="mb-4 text-3xl font-semibold text-ink">{d.title}</h1>}
                {d.body.trim() ? <Markdown source={d.body} imageUrl={(src) => blogImageUrl(src) ?? src} /> : <p className="text-ink-muted">{t('blog.nothingYet')}</p>}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('blog.publishing')}>
            <div className="space-y-3 text-sm">
              <p className="text-ink-muted">{t('blog.status')}: <Badge tone={state({ status: d.status, published_at: d.published_at ? new Date(d.published_at).toISOString() : null }).tone}>
                {t(`blog.state.${state({ status: d.status, published_at: d.published_at ? new Date(d.published_at).toISOString() : null }).key}`)}</Badge></p>
              <Field id="bp-date" label={t('blog.fields.date')} hint={t('blog.fields.dateHint')}>
                <input id="bp-date" type="datetime-local" value={d.published_at} onChange={(e) => set('published_at', e.target.value)} className={`${control} w-full`} />
              </Field>
              <Field id="bp-author" label={t('blog.fields.author')}>
                <input id="bp-author" value={d.author_name} onChange={(e) => set('author_name', e.target.value)} maxLength={80} className={`${control} w-full`} placeholder={t('blog.fields.authorPh')} />
              </Field>
            </div>
          </Card>

          <Card title={t('blog.fields.cover')}>
            {cover ? (
              <div className="relative">
                <img src={cover} alt="" className="aspect-[16/9] w-full rounded-lg object-cover" />
                <button type="button" onClick={() => set('cover_path', null)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80" aria-label={t('blog.removeCover')}><X size={15} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => coverInput.current?.click()} disabled={!!uploading}
                className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-sm text-ink-muted hover:border-brand hover:text-brand">
                <Upload size={20} aria-hidden />{uploading === 'cover' ? t('blog.uploading') : t('blog.uploadCover')}
              </button>
            )}
            <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void upload(e, 'cover')} />
            {cover && <button type="button" onClick={() => coverInput.current?.click()} className="mt-2 text-xs text-brand hover:underline">{t('blog.changeCover')}</button>}
            <p className="mt-2 text-xs text-ink-muted">{t('blog.coverHint')}</p>
          </Card>

          <Card title={t('blog.fields.tags')}>
            <div className="flex flex-wrap gap-1.5">
              {d.tags.map((x) => (
                <span key={x} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                  {x}<button type="button" onClick={() => set('tags', d.tags.filter((y) => y !== x))} aria-label={t('blog.removeTag', { tag: x })}><X size={12} /></button>
                </span>
              ))}
            </div>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onBlur={addTag}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
              aria-label={t('blog.fields.tags')} placeholder={t('blog.fields.tagsPh')} className={`${control} mt-2 w-full`} />
          </Card>

          <Card title={t('blog.seo')}>
            <div className="space-y-3">
              <Field id="bp-slug" label={t('blog.fields.slug')} hint={`/blog/${d.slug || '…'}`}>
                <input id="bp-slug" value={d.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value) || e.target.value.toLowerCase()); }} className={`${control} w-full font-mono text-xs`} />
              </Field>
              <Field id="bp-seot" label={t('blog.fields.seoTitle')} hint={t('blog.fields.seoTitleHint')}>
                <input id="bp-seot" value={d.seo_title} onChange={(e) => set('seo_title', e.target.value)} maxLength={120} className={`${control} w-full`} />
              </Field>
              <Field id="bp-seod" label={t('blog.fields.seoDescription')} hint={t('blog.chars', { count: d.seo_description.length, max: 300 })}>
                <textarea id="bp-seod" value={d.seo_description} onChange={(e) => set('seo_description', e.target.value)} maxLength={300} rows={3} className={`${control} h-auto w-full py-2`} />
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
