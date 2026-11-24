-- Tipo de contratação (CLT/PJ) e modelo de trabalho (remoto/híbrido/presencial).
-- Vale para as vagas e para as preferências do usuário. Idempotente.

alter table jobs add column if not exists contract_type text;
alter table jobs add column if not exists work_model text;
alter table user_settings add column if not exists contract_type text;
alter table user_settings add column if not exists work_model text;

do $$ begin
  alter table jobs add constraint jobs_contract_type_chk check (contract_type in ('clt','pj'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table jobs add constraint jobs_work_model_chk check (work_model in ('remoto','hibrido','presencial'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table user_settings add constraint user_settings_contract_type_chk check (contract_type in ('clt','pj'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table user_settings add constraint user_settings_work_model_chk check (work_model in ('remoto','hibrido','presencial'));
exception when duplicate_object then null;
end $$;
