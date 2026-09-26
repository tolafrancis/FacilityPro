-- Blog suite (0093). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set owner   '00000000-0000-0000-0000-00000000000a'
insert into fp_platform_admins (user_id, role) values (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support');
create temp table j (k text, v jsonb);
grant all on j to anon, authenticated;

select t.run('authenticated', :'padmin', $q$insert into j select 'p1', to_jsonb(fp_admin_save_blog_post('{"title":"Preventive vs reactive","slug":"preventive-vs-reactive","body":"word word word","tags":["Maintenance"," PM ",""],"status":"published"}'))$q$);
select t.check('admins publish posts; tags are cleaned and a publish date is set',
  (select v ->> 'status' = 'published' and v ->> 'published_at' is not null and v -> 'tags' = '["maintenance","pm"]'::jsonb
          and (v ->> 'reading_minutes')::int = 1 from j where k = 'p1'));
select v ->> 'id' as "p1" from j where k = 'p1' \gset
select t.run('authenticated', :'super', $q$select fp_admin_save_blog_post('{"title":"Draft idea","slug":"draft-idea","body":"x"}')$q$);
select t.run('authenticated', :'super', $q$select fp_admin_save_blog_post(jsonb_build_object('title','Next week','slug','next-week','body','x','status','published','published_at', (now() + interval '7 days')::text))$q$);

select t.check('visitors and tenants only see published posts whose date has come',
  t.run('anon', null, 'select * from fp_blog_posts') = 'ok:1'
  and t.run('authenticated', :'owner', 'select * from fp_blog_posts') = 'ok:1'
  and t.run('anon', null, $q$select * from fp_blog_posts where slug in ('draft-idea','next-week')$q$) = 'ok:0');
select t.check('content staff see drafts and scheduled posts; support staff do not',
  t.run('authenticated', :'padmin', 'select * from fp_blog_posts') = 'ok:3'
  and t.run('authenticated', :'support', 'select * from fp_blog_posts') = 'ok:1');
select t.check('only content staff can write, and never directly',
  t.run('authenticated', :'support', $q$select fp_admin_save_blog_post('{"title":"x","slug":"x"}')$q$) like 'err:%'
  and t.run('authenticated', :'owner', $q$select fp_admin_save_blog_post('{"title":"x","slug":"x"}')$q$) like 'err:%'
  and t.run('anon', null, $q$select fp_admin_save_blog_post('{"title":"x","slug":"x"}')$q$) like 'err:%'
  and t.run('authenticated', :'super', $q$update fp_blog_posts set title = 'hacked'$q$) like 'err:%'
  and t.run('anon', null, $q$delete from fp_blog_posts$q$) like 'err:%');
select t.check('slugs must be unique and URL-safe',
  t.run('authenticated', :'super', $q$select fp_admin_save_blog_post('{"title":"Again","slug":"preventive-vs-reactive"}')$q$) like 'err:%blog_slug_taken%'
  and t.run('authenticated', :'super', $q$select fp_admin_save_blog_post('{"title":"Bad","slug":"Bad Slug!"}')$q$) like 'err:%');

select t.run('authenticated', :'super', format($q$select fp_admin_save_blog_post('{"id":"%s","title":"Preventive vs reactive","slug":"preventive-vs-reactive","body":"x","status":"draft"}')$q$, :'p1'));
select t.check('unpublishing hides a post from the public at once',
  t.run('anon', null, 'select * from fp_blog_posts') = 'ok:0');
select t.check('changes are in the admin audit log',
  exists (select 1 from fp_admin_audit where target_type = 'fp_blog_posts' and action = 'update' and before ->> 'status' = 'published' and after ->> 'status' = 'draft'));
select t.run('authenticated', :'padmin', format($q$select fp_admin_delete_blog_post(%L)$q$, :'p1'));
select t.check('content staff delete posts',
  not exists (select 1 from fp_blog_posts where id = :'p1'));

select t.check('only content staff upload blog images, and only under posts/',
  t.run('authenticated', :'padmin', $q$insert into storage.objects (bucket_id, name) values ('fp-blog', 'posts/a.png')$q$) = 'ok:1'
  and t.run('authenticated', :'padmin', $q$insert into storage.objects (bucket_id, name) values ('fp-blog', 'other/a.png')$q$) like 'err:%'
  and t.run('authenticated', :'owner', $q$insert into storage.objects (bucket_id, name) values ('fp-blog', 'posts/b.png')$q$) like 'err:%'
  and t.run('authenticated', :'support', $q$insert into storage.objects (bucket_id, name) values ('fp-blog', 'posts/c.png')$q$) like 'err:%');

\ir _report.sql
