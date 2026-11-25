-- Histórico de análises: permite várias linhas por usuário.
-- A PK antiga era user_id; passa a ser id, mantendo user_id como FK.
-- Idempotente: se a PK já for (id), não faz nada.

do $$
declare
  pk_def text;
begin
  select pg_get_constraintdef(oid)
    into pk_def
  from pg_constraint
  where conrelid = 'public.resume_analyses'::regclass
    and contype = 'p';

  if pk_def is distinct from 'PRIMARY KEY (id)' then
    alter table resume_analyses add column if not exists id uuid not null default gen_random_uuid();
    alter table resume_analyses drop constraint if exists resume_analyses_pkey;
    alter table resume_analyses add constraint resume_analyses_pkey primary key (id);
  end if;
end $$;

create index if not exists resume_analyses_user_created_idx
  on resume_analyses (user_id, created_at desc);
