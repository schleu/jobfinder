-- jobFinder — schema inicial (idempotente)
-- Rode no SQL Editor ou aplique com `supabase db push`.
-- Seguro para reexecutar: não apaga dados existentes.

-- Enum de status (create type não aceita IF NOT EXISTS)
do $$ begin
  create type job_status as enum ('nova','cadastrado','em_processo','aprovado','reprovado','cancelada');
exception when duplicate_object then null;
end $$;

create table if not exists user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  resume_path text, salary_min numeric, salary_max numeric
);

create table if not exists job_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null
);

create table if not exists job_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, url text not null, active boolean not null default true
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  company text not null, role text not null, site text not null, url text, salary text,
  status job_status not null default 'nova', status_note text, external_id text,
  applied_at timestamptz,
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, site, external_id)
);

create table if not exists job_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs on delete cascade,
  status job_status not null, note text, source text not null,
  created_at timestamptz not null default now()
);

-- Histórico automático: vale para o app (manual) e para as skills (service role)
create or replace function jobs_touch() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_updated_at := now(); end if;
  return new;
end $$;

drop trigger if exists jobs_touch_t on jobs;
create trigger jobs_touch_t before update on jobs for each row execute function jobs_touch();

create or replace function jobs_log() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into job_status_history (job_id, status, note, source)
    values (new.id, new.status, new.status_note,
            case when auth.role() = 'service_role' then 'claude_code' else 'manual' end);
  end if;
  return new;
end $$;

drop trigger if exists jobs_log_t on jobs;
create trigger jobs_log_t after insert or update on jobs for each row execute function jobs_log();

-- RLS
alter table user_settings enable row level security;
alter table job_roles enable row level security;
alter table job_sites enable row level security;
alter table jobs enable row level security;
alter table job_status_history enable row level security;

drop policy if exists own on user_settings;
create policy own on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own on job_roles;
create policy own on job_roles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own on job_sites;
create policy own on job_sites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own on jobs;
create policy own on jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own on job_status_history;
create policy own on job_status_history for select
  using (exists (select 1 from jobs j where j.id = job_id and j.user_id = auth.uid()));

-- Storage do currículo
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
  on conflict (id) do nothing;
drop policy if exists resumes_own on storage.objects;
create policy resumes_own on storage.objects for all to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
