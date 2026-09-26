import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Blog (migration 0093). Visitors read published posts straight from the
// table (RLS only returns those); staff write through fp_admin_save_blog_post.

export const BLOG_BUCKET = 'fp-blog';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  cover_path: string | null;
  tags: string[];
  author_name: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  reading_minutes: number;
  created_at: string;
  updated_at: string;
}

const LIST_COLUMNS = 'id, slug, title, excerpt, cover_path, tags, author_name, status, published_at, reading_minutes, created_at, updated_at';

export function blogImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(BLOG_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** "Hello, World!" → "hello-world" (Vietnamese accents removed). */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

export function isLive(p: Pick<BlogPost, 'status' | 'published_at'>, now = Date.now()): boolean {
  return p.status === 'published' && !!p.published_at && new Date(p.published_at).getTime() <= now;
}

export function usePublishedPosts(tag?: string) {
  return useQuery({
    queryKey: ['blog_posts', tag ?? ''],
    queryFn: async () => {
      let q = supabase.from('fp_blog_posts').select(LIST_COLUMNS)
        .eq('status', 'published').lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false }).limit(100);
      if (tag) q = q.contains('tags', [tag]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Omit<BlogPost, 'body' | 'seo_title' | 'seo_description'>[];
    },
  });
}

export function usePost(slug: string | undefined) {
  return useQuery({
    queryKey: ['blog_post', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_blog_posts').select('*').eq('slug', slug!).maybeSingle();
      if (error) throw error;
      return data as BlogPost | null;
    },
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
export function useAllPosts() {
  return useQuery({
    queryKey: ['admin_blog_posts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_blog_posts').select(LIST_COLUMNS).order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Omit<BlogPost, 'body' | 'seo_title' | 'seo_description'>[];
    },
  });
}

export function useAdminPost(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_blog_post', id],
    enabled: !!id && id !== 'new',
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_blog_posts').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as BlogPost;
    },
  });
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Uploads an image to the blog bucket; returns its storage path. */
export async function uploadBlogImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('blog_image_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('blog_image_size');
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `posts/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BLOG_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}
