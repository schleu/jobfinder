-- Guarda o texto extraído do PDF junto da análise, para exibir na aba Currículo.
alter table resume_analyses add column if not exists text text;
