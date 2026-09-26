import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Newspaper } from 'lucide-react';
import MarketingLayout, { TrialForm } from '../marketing/MarketingLayout';
import { Markdown } from '../lib/markdown';
import { blogImageUrl, isLive, usePost, usePublishedPosts, type BlogPost } from '../lib/blog';

// Public blog: /blog (list, ?tag= filter) and /blog/:slug (one post).

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

function useMeta(title: string, description?: string | null) {
  useEffect(() => {
    document.title = title;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const before = tag?.content;
    if (description) {
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = 'description';
        document.head.appendChild(tag);
      }
      tag.content = description;
    }
    return () => {
      document.title = 'FacilityPro';
      if (tag && before !== undefined) tag.content = before;
    };
  }, [title, description]);
}

type ListPost = Omit<BlogPost, 'body' | 'seo_title' | 'seo_description'>;

function PostCard({ p, large = false }: { p: ListPost; large?: boolean }) {
  const cover = blogImageUrl(p.cover_path);
  return (
    <Link to={`/blog/${p.slug}`} className={`group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:border-brand hover:shadow-md ${large ? 'md:col-span-2 md:flex-row' : ''}`}>
      <div className={`${large ? 'md:w-3/5' : ''} aspect-[16/9] shrink-0 overflow-hidden bg-brand/5`}>
        {cover
          ? <img src={cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
          : <div className="grid h-full w-full place-items-center text-brand/40"><Newspaper size={44} aria-hidden /></div>}
      </div>
      <div className="flex flex-1 flex-col p-6">
        {p.tags.length > 0 && <p className="text-xs font-semibold uppercase tracking-wider text-brand">{p.tags.slice(0, 2).join(' · ')}</p>}
        <h2 className={`mt-2 font-semibold text-ink group-hover:text-brand ${large ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{p.title}</h2>
        {p.excerpt && <p className="mt-2 line-clamp-3 text-[15px] leading-7 text-ink-muted">{p.excerpt}</p>}
        <p className="mt-auto pt-4 text-sm text-ink-muted">
          {formatDate(p.published_at)} · {p.reading_minutes} min read
        </p>
      </div>
    </Link>
  );
}

export function BlogIndex() {
  const [params] = useSearchParams();
  const tag = params.get('tag') ?? undefined;
  const q = usePublishedPosts(tag);
  useMeta(tag ? `${tag} · FacilityPro blog` : 'Blog · FacilityPro', 'Maintenance, facilities management and product news from the FacilityPro team.');
  const posts = q.data ?? [];
  const tags = [...new Set(posts.flatMap((p) => p.tags))].sort();

  return (
    <MarketingLayout>
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Blog</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{tag ? `Posts about “${tag}”` : 'Ideas for better facilities operations'}</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-muted">Guides, best practice and product news for maintenance and facilities teams.</p>
          {(tags.length > 0 || tag) && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/blog" className={`rounded-full border px-3.5 py-1.5 text-sm ${!tag ? 'border-brand bg-brand text-white' : 'border-line text-ink hover:border-brand hover:text-brand'}`}>All posts</Link>
              {(tag && !tags.includes(tag) ? [tag, ...tags] : tags).map((x) => (
                <Link key={x} to={`/blog?tag=${encodeURIComponent(x)}`} className={`rounded-full border px-3.5 py-1.5 text-sm capitalize ${x === tag ? 'border-brand bg-brand text-white' : 'border-line text-ink hover:border-brand hover:text-brand'}`}>{x}</Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {q.isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-ink/5" />)}</div>
        ) : q.isError ? (
          <p className="text-ink-muted">The blog couldn’t load. Please try again in a moment.</p>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-12 text-center">
            <Newspaper size={32} className="mx-auto text-brand/50" aria-hidden />
            <p className="mt-3 text-lg font-medium text-ink">No posts yet</p>
            <p className="mt-1 text-ink-muted">New articles are on their way — check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => <PostCard key={p.id} p={p} large={i === 0 && !tag && posts.length > 2} />)}
          </div>
        )}
      </section>
    </MarketingLayout>
  );
}

export function BlogPostPage() {
  const { slug } = useParams();
  const q = usePost(slug);
  const p = q.data;
  useMeta(p ? `${p.seo_title || p.title} · FacilityPro` : 'Blog · FacilityPro', p?.seo_description || p?.excerpt);
  useEffect(() => window.scrollTo({ top: 0 }), [slug]);
  const more = usePublishedPosts(p?.tags[0]).data?.filter((x) => x.slug !== slug).slice(0, 3) ?? [];
  const cover = blogImageUrl(p?.cover_path);

  return (
    <MarketingLayout>
      {q.isLoading ? (
        <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-10 w-2/3 animate-pulse rounded bg-ink/5" /><div className="mt-6 h-64 animate-pulse rounded-2xl bg-ink/5" /></div>
      ) : !p ? (
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <p className="text-2xl font-semibold text-ink">This post isn’t available</p>
          <p className="mt-2 text-ink-muted">It may have been moved or unpublished.</p>
          <Link to="/blog" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand hover:underline"><ArrowLeft size={16} aria-hidden /> All posts</Link>
        </div>
      ) : (
        <article>
          {!isLive(p) && (
            <div className="bg-amber-100 px-4 py-2.5 text-center text-sm font-medium text-amber-900">
              Preview — only staff can see this post until it’s published{p.status === 'published' && p.published_at ? ` (scheduled for ${formatDate(p.published_at)})` : ''}.
            </div>
          )}
          <header className="mx-auto max-w-3xl px-4 pb-8 pt-12 sm:px-6 lg:pt-16">
            <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand"><ArrowLeft size={15} aria-hidden /> Blog</Link>
            {p.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {p.tags.map((x) => <Link key={x} to={`/blog?tag=${encodeURIComponent(x)}`} className="text-xs font-semibold uppercase tracking-wider text-brand hover:underline">{x}</Link>)}
              </div>
            )}
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{p.title}</h1>
            {p.excerpt && <p className="mt-4 text-xl leading-8 text-ink-muted">{p.excerpt}</p>}
            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              {p.author_name && <span className="font-medium text-ink">{p.author_name}</span>}
              <span>{formatDate(p.published_at)}</span>
              <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />{p.reading_minutes} min read</span>
            </p>
          </header>
          {cover && (
            <div className="mx-auto max-w-5xl px-4 sm:px-6">
              <img src={cover} alt="" className="aspect-[16/8] w-full rounded-3xl object-cover" />
            </div>
          )}
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
            <Markdown source={p.body} imageUrl={(src) => blogImageUrl(src) ?? src} />
          </div>
          <div className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">
            <div className="rounded-2xl bg-brand/5 p-6 sm:p-8">
              <p className="text-xl font-semibold text-ink">Run your maintenance from one place</p>
              <p className="mt-1 text-ink-muted">Try FacilityPro free — requests, work orders, preventive maintenance and assets.</p>
              <TrialForm className="mt-4" />
            </div>
          </div>
          {more.length > 0 && (
            <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-semibold text-ink">Keep reading</h2>
              <div className="mt-6 grid gap-6 md:grid-cols-3">{more.map((x) => <PostCard key={x.id} p={x} />)}</div>
            </section>
          )}
        </article>
      )}
    </MarketingLayout>
  );
}
