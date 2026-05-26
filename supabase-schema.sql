-- Run this entire file in the Supabase SQL editor (supabase.com → your project → SQL Editor)

-- Recipes
create table recipes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  name        text not null,
  source_url  text,
  notes       text,
  season_tags text[] default '{}',
  diet_tags   text[] default '{}',
  rating      smallint check (rating between 1 and 5),
  rating_notes text,
  make_again  boolean default false,
  rated_at    timestamptz
);

-- Ingredients (child of recipes; cascade-deletes when recipe is deleted)
create table ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipes(id) on delete cascade,
  name          text not null,
  amount        numeric,
  unit          text,
  store_section text default 'other'
);

-- Shopping list (single persistent list, cleared manually)
create table shopping_items (
  id            uuid primary key default gen_random_uuid(),
  added_at      timestamptz default now(),
  name          text not null unique,
  amount        text,
  store_section text not null default 'other',
  checked       boolean not null default false,
  is_manual     boolean not null default false,
  recipe_ids    uuid[] default '{}'
);

-- Row-level security: allow full anon access (personal tool, no auth needed)
alter table recipes        enable row level security;
alter table ingredients    enable row level security;
alter table shopping_items enable row level security;

create policy "anon all" on recipes        for all using (true) with check (true);
create policy "anon all" on ingredients    for all using (true) with check (true);
create policy "anon all" on shopping_items for all using (true) with check (true);
