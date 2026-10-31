-- Clean TDS wiki reset, GitHub identity check, owner-only editing, and templates.
begin;
truncate table public.wiki_page_revisions, public.wiki_page_categories, public.wiki_pages, public.wiki_categories restart identity cascade;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.is_tds_wiki_owner()
returns boolean language sql stable security definer set search_path = pg_catalog, auth
as $$
 select exists(select 1 from auth.identities i where i.user_id=(select auth.uid()) and i.provider='github' and i.provider_id='281789543');
$$;
revoke all on function private.is_tds_wiki_owner() from public, anon;
grant execute on function private.is_tds_wiki_owner() to authenticated;
create or replace function public.is_tds_wiki_owner()
returns boolean language sql stable security invoker set search_path = pg_catalog, public, private
as $$ select private.is_tds_wiki_owner(); $$;
revoke all on function public.is_tds_wiki_owner() from public, anon;
grant execute on function public.is_tds_wiki_owner() to authenticated;
create table if not exists public.wiki_templates (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 content_wikitext text not null default '', summary text not null default '',
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists wiki_templates_name_idx on public.wiki_templates(name);
drop trigger if exists wiki_templates_set_updated_at on public.wiki_templates;
create trigger wiki_templates_set_updated_at before update on public.wiki_templates for each row execute function public.wiki_set_updated_at();
alter table public.wiki_templates enable row level security;
drop policy if exists "Authenticated users can create wiki pages" on public.wiki_pages;
drop policy if exists "Authenticated users can edit wiki pages" on public.wiki_pages;
drop policy if exists "Authenticated users can delete wiki pages" on public.wiki_pages;
drop policy if exists "Authenticated users can manage wiki categories" on public.wiki_categories;
drop policy if exists "Authenticated users can manage page categories" on public.wiki_page_categories;
drop policy if exists "Authenticated users can add revisions" on public.wiki_page_revisions;
create policy "Only Zac can create wiki pages" on public.wiki_pages for insert to authenticated with check ((select public.is_tds_wiki_owner()));
create policy "Only Zac can edit wiki pages" on public.wiki_pages for update to authenticated using ((select public.is_tds_wiki_owner())) with check ((select public.is_tds_wiki_owner()));
create policy "Only Zac can delete wiki pages" on public.wiki_pages for delete to authenticated using ((select public.is_tds_wiki_owner()));
create policy "Only Zac can manage wiki categories" on public.wiki_categories for all to authenticated using ((select public.is_tds_wiki_owner())) with check ((select public.is_tds_wiki_owner()));
create policy "Only Zac can manage page categories" on public.wiki_page_categories for all to authenticated using ((select public.is_tds_wiki_owner())) with check ((select public.is_tds_wiki_owner()));
create policy "Only Zac can add revisions" on public.wiki_page_revisions for insert to authenticated with check ((select public.is_tds_wiki_owner()));
create policy "Public can read wiki templates" on public.wiki_templates for select using (true);
create policy "Only Zac can manage wiki templates" on public.wiki_templates for all to authenticated using ((select public.is_tds_wiki_owner())) with check ((select public.is_tds_wiki_owner()));
grant select on public.wiki_templates to anon, authenticated;
grant insert, update, delete on public.wiki_templates to authenticated;
commit;
