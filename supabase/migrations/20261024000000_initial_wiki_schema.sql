create extension if not exists pgcrypto;

create table if not exists public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content_wikitext text not null default '',
  content_html text not null default '',
  summary text not null default '',
  source_url text,
  source_revision_id bigint,
  source_timestamp timestamptz,
  imported_at timestamptz,
  is_source_import boolean not null default false,
  locally_edited boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content_wikitext, '')), 'C')
  ) stored
);

create index if not exists wiki_pages_search_idx on public.wiki_pages using gin(search_vector);
create index if not exists wiki_pages_updated_at_idx on public.wiki_pages(updated_at desc);

create table if not exists public.wiki_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.wiki_page_categories (
  page_id uuid not null references public.wiki_pages(id) on delete cascade,
  category_id uuid not null references public.wiki_categories(id) on delete cascade,
  primary key (page_id, category_id)
);

create table if not exists public.wiki_page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.wiki_pages(id) on delete cascade,
  title text not null,
  content_wikitext text not null,
  content_html text not null default '',
  summary text not null default '',
  editor_id uuid references auth.users(id) on delete set null,
  edit_summary text not null default '',
  source_revision_id bigint,
  is_import boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists wiki_page_revisions_page_idx
  on public.wiki_page_revisions(page_id, created_at desc);
create unique index if not exists wiki_page_revisions_source_revision_unique
  on public.wiki_page_revisions(source_revision_id) where source_revision_id is not null;

create or replace function public.wiki_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wiki_pages_set_updated_at on public.wiki_pages;
create trigger wiki_pages_set_updated_at
before update on public.wiki_pages
for each row execute function public.wiki_set_updated_at();

alter table public.wiki_pages enable row level security;
alter table public.wiki_categories enable row level security;
alter table public.wiki_page_categories enable row level security;
alter table public.wiki_page_revisions enable row level security;

drop policy if exists "Public can read wiki pages" on public.wiki_pages;
create policy "Public can read wiki pages" on public.wiki_pages for select using (true);
drop policy if exists "Authenticated users can create wiki pages" on public.wiki_pages;
create policy "Authenticated users can create wiki pages" on public.wiki_pages for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "Authenticated users can edit wiki pages" on public.wiki_pages;
create policy "Authenticated users can edit wiki pages" on public.wiki_pages for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "Authenticated users can delete wiki pages" on public.wiki_pages;
create policy "Authenticated users can delete wiki pages" on public.wiki_pages for delete to authenticated using (auth.uid() is not null);

drop policy if exists "Public can read wiki categories" on public.wiki_categories;
create policy "Public can read wiki categories" on public.wiki_categories for select using (true);
drop policy if exists "Authenticated users can manage wiki categories" on public.wiki_categories;
create policy "Authenticated users can manage wiki categories" on public.wiki_categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "Public can read page categories" on public.wiki_page_categories;
create policy "Public can read page categories" on public.wiki_page_categories for select using (true);
drop policy if exists "Authenticated users can manage page categories" on public.wiki_page_categories;
create policy "Authenticated users can manage page categories" on public.wiki_page_categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "Public can read page revisions" on public.wiki_page_revisions;
create policy "Public can read page revisions" on public.wiki_page_revisions for select using (true);
drop policy if exists "Authenticated users can add revisions" on public.wiki_page_revisions;
create policy "Authenticated users can add revisions" on public.wiki_page_revisions for insert to authenticated with check (auth.uid() is not null);
