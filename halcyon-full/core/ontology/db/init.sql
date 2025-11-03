create table if not exists entity_types (
  name text primary key,
  spec jsonb not null,
  version text not null,
  updated_at timestamptz not null default now()
);
create table if not exists relationship_types (
  name text primary key,
  spec jsonb not null,
  version text not null,
  updated_at timestamptz not null default now()
);
