-- Axis Variations: the schema applied to Supabase project jpodxbzhzgndujdaqldl
-- (migration "axis_variations"). Kept here as the record of it; it is not run
-- by any build. See docs/SUPABASE.md.

create table public.av_projects (
  id bigint generated always as identity primary key,
  state text not null,
  title text not null,
  project_number text not null default '',
  head_contractor text not null default '',
  recipient_address text not null default '',
  attention text not null default '',
  issued_by text not null default '',
  position text not null default '',
  pm_email text not null default '',
  folder_path text not null default '',
  site_url text not null default '',
  clause_ref text not null default '',
  active boolean not null default true,
  rates_path text not null default '',
  rates_name text not null default '',
  rates_uploaded_at timestamptz,
  legacy_id text,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index av_projects_state on public.av_projects (state);

create table public.av_variations (
  id bigint generated always as identity primary key,
  state text not null,
  project_id bigint not null references public.av_projects(id),
  variation_ref text not null,
  base_ref text not null default '',
  revision text not null default '',
  project text not null default '',
  project_number text not null default '',
  variation_description text not null default '',
  head_contractor text not null default '',
  recipient_address text not null default '',
  attention text not null default '',
  issued_by text not null default '',
  position text not null default '',
  pm_email text not null default '',
  site_instruction_ref text not null default '',
  clause_ref text not null default '',
  aconex_ref text not null default '',
  contractor_direction text not null default '',
  email_ref text not null default '',
  description_of_works text not null default '',
  notes text not null default '',
  drawings_text text not null default '',
  day_sheets_text text not null default '',
  folder_path text not null default '',
  status text not null default 'Draft',
  value_ex_gst numeric,
  approved_value numeric,
  approved_date date,
  builder_commentary text not null default '',
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by text not null default '',
  payload jsonb,
  variation_file_path text not null default '',
  downloaded_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (state, project_id, variation_ref)
);
create index av_variations_state_project on public.av_variations (state, project_id);

alter table public.av_projects enable row level security;
alter table public.av_variations enable row level security;
create policy "av read projects" on public.av_projects for select to anon, authenticated using (true);
create policy "av add projects" on public.av_projects for insert to anon, authenticated with check (true);
create policy "av update projects" on public.av_projects for update to anon, authenticated using (true) with check (true);
create policy "av read variations" on public.av_variations for select to anon, authenticated using (true);
create policy "av add variations" on public.av_variations for insert to anon, authenticated with check (true);
create policy "av update variations" on public.av_variations for update to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('av-files', 'av-files', false, 52428800)
on conflict (id) do nothing;
create policy "av read files" on storage.objects for select to anon, authenticated using (bucket_id = 'av-files');
create policy "av write files" on storage.objects for insert to anon, authenticated with check (bucket_id = 'av-files');
create policy "av update files" on storage.objects for update to anon, authenticated using (bucket_id = 'av-files') with check (bucket_id = 'av-files');
