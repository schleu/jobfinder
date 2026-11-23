-- jobFinder — análise do currículo com IA (aba Currículo)
-- Rode no SQL Editor ou aplique com `supabase db push`.
-- Seguro para reexecutar: mantém a análise existente e só recria a policy.

create table if not exists resume_analyses (
  user_id uuid primary key references auth.users on delete cascade,
  resume_path text not null,
  model text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table resume_analyses enable row level security;

drop policy if exists own on resume_analyses;
create policy own on resume_analyses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
