-- 0093_blog.sql
-- Blog for the public site (/blog), written in the admin panel (/admin/blog).
-- Covered by supabase/security-tests/blog.sql.
--
--   * Posts: title, slug, excerpt, Markdown body, cover image, tags, author,
--     SEO title/description; draft or published, with a publish date (a
--     future date schedules the post).
--   * Everyone (signed in or not) reads published posts whose date has
--     come; nothing else. Staff who manage announcements (super admins,
--     admins) see drafts and write posts, only through the functions below;
--     every change is in the admin audit log.
--   * Images live in the public "fp-blog" bucket; only those staff upload.

create table if not exists fp_blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  title           text not null check (length(btrim(title)) between 1 and 200),
  excerpt         text check (excerpt is null or length(excerpt) <= 400),
  body            text not null default '' check (length(body) <= 200000),
  cover_path      text check (cover_path is null or (cover_path ~ '^posts/' and length(cover_path) <= 200)),
  tags            text[] not null default '{}' check (cardinality(tags) <= 10),
  author_name     text check (author_name is null or length(author_name) <= 80),
  author_id       uuid references auth.users(id) on delete set null,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  seo_title       text check (seo_title is null or length(seo_title) <= 120),
  seo_description text check (seo_description is null or length(seo_description) <= 300),
  reading_minutes int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fp_blog_posts_published_idx on fp_blog_posts (published_at desc) where status = 'published';

alter table fp_blog_posts enable row level security;
drop policy if exists blog_public_read on fp_blog_posts;
create policy blog_public_read on fp_blog_posts for select to anon, authenticated
  using ( status = 'published' and published_at <= now() );
drop policy if exists blog_staff_read on fp_blog_posts;
create policy blog_staff_read on fp_blog_posts for select to authenticated
  using ( fp_admin_can('announcements.manage') );
grant select on fp_blog_posts to anon, authenticated;
revoke insert, update, delete on fp_blog_posts from anon, authenticated;

drop trigger if exists trg_admin_audit on fp_blog_posts;
create trigger trg_admin_audit after insert or update or delete on fp_blog_posts
  for each row execute function fp_admin_audit_trigger();

-- ---------------------------------------------------------------------------
-- Write (staff)
-- ---------------------------------------------------------------------------
create or replace function fp_admin_save_blog_post(p jsonb)
returns fp_blog_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_status text := coalesce(nullif(p ->> 'status', ''), 'draft');
  v_body   text := coalesce(p ->> 'body', '');
  v_words  int;
  v_pub    timestamptz := nullif(p ->> 'published_at', '')::timestamptz;
  r        fp_blog_posts;
begin
  perform fp_admin_require('announcements.manage');
  if exists (select 1 from fp_blog_posts where slug = lower(btrim(p ->> 'slug')) and id is distinct from v_id) then
    raise exception 'blog_slug_taken';
  end if;
  v_words := coalesce(array_length(regexp_split_to_array(btrim(v_body), '\s+'), 1), 0);
  -- Publishing without a date means now; a draft keeps whatever date it had.
  if v_status = 'published' and v_pub is null then
    v_pub := coalesce((select published_at from fp_blog_posts where id = v_id), now());
  end if;

  if v_id is null then
    insert into fp_blog_posts (slug, title, excerpt, body, cover_path, tags, author_name, author_id, status, published_at,
                               seo_title, seo_description, reading_minutes)
    values (lower(btrim(p ->> 'slug')), btrim(p ->> 'title'), nullif(btrim(p ->> 'excerpt'), ''), v_body,
            nullif(p ->> 'cover_path', ''),
            coalesce((select array_agg(distinct lower(btrim(x))) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'tags') = 'array' then p -> 'tags' else '[]' end) x where btrim(x) <> ''), '{}'),
            nullif(btrim(p ->> 'author_name'), ''), auth.uid(), v_status, v_pub,
            nullif(btrim(p ->> 'seo_title'), ''), nullif(btrim(p ->> 'seo_description'), ''),
            greatest(1, round(v_words / 220.0)::int))
    returning * into r;
  else
    update fp_blog_posts set
      slug = lower(btrim(p ->> 'slug')), title = btrim(p ->> 'title'), excerpt = nullif(btrim(p ->> 'excerpt'), ''),
      body = v_body, cover_path = nullif(p ->> 'cover_path', ''),
      tags = coalesce((select array_agg(distinct lower(btrim(x))) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'tags') = 'array' then p -> 'tags' else '[]' end) x where btrim(x) <> ''), '{}'),
      author_name = nullif(btrim(p ->> 'author_name'), ''), status = v_status, published_at = v_pub,
      seo_title = nullif(btrim(p ->> 'seo_title'), ''), seo_description = nullif(btrim(p ->> 'seo_description'), ''),
      reading_minutes = greatest(1, round(v_words / 220.0)::int), updated_at = now()
    where id = v_id
    returning * into r;
    if r.id is null then
      raise exception 'Post not found' using errcode = 'P0002';
    end if;
  end if;
  return r;
end;
$$;

create or replace function fp_admin_delete_blog_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('announcements.manage');
  delete from fp_blog_posts where id = p_id;
end;
$$;

revoke execute on function fp_admin_save_blog_post(jsonb), fp_admin_delete_blog_post(uuid) from public, anon, authenticated;
grant execute on function fp_admin_save_blog_post(jsonb), fp_admin_delete_blog_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Images (public bucket; staff upload under posts/)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fp-blog', 'fp-blog', true)
on conflict (id) do update set public = true;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
      set file_size_limit = 5242880,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
      where id = 'fp-blog';
  end if;
end $$;

drop policy if exists "fp_blog insert" on storage.objects;
drop policy if exists "fp_blog update" on storage.objects;
drop policy if exists "fp_blog delete" on storage.objects;
create policy "fp_blog insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'fp-blog' and name like 'posts/%' and fp_admin_can('announcements.manage') );
create policy "fp_blog update" on storage.objects for update to authenticated
  using ( bucket_id = 'fp-blog' and fp_admin_can('announcements.manage') );
create policy "fp_blog delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'fp-blog' and fp_admin_can('announcements.manage') );
