-- Descrição completa da vaga (texto simples, sem HTML). Idempotente.
alter table jobs add column if not exists description text;
