# Banco de dados

Todo o esquema vive em `supabase/migrations`, em scripts **idempotentes** (podem ser reaplicados sem apagar dados). Não existe mais `schema.sql`: as migrações são a única fonte.

## Migrações

Aplicadas em ordem pelo nome:

| Arquivo | O que faz |
| --- | --- |
| `20261123120000_initial_schema.sql` | Enum de status, tabelas principais, triggers, RLS e bucket `resumes` |
| `20261123120100_resume_analyses.sql` | Tabela `resume_analyses` + policy |
| `20261123130000_resume_analysis_text.sql` | Coluna `text` (PDF extraído) em `resume_analyses` |
| `20261124120000_job_contract_work_model.sql` | `contract_type` e `work_model` em `jobs` e `user_settings` |

Como aplicar:

- **Projeto novo**: rode todos os arquivos na ordem no SQL Editor, ou `supabase db push`.
- **Projeto existente**: rode só as migrações novas.
- `supabase db push` exige o projeto linkado (`supabase link --project-ref <ref>`).

## Tabelas

### `user_settings` (1 linha por usuário)

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `user_id` | uuid PK | default `auth.uid()`, references `auth.users` (cascade) |
| `resume_path` | text | caminho do PDF no bucket `resumes` |
| `salary_min`, `salary_max` | numeric | faixa desejada |
| `contract_type` | text | `clt` ou `pj` (check) |
| `work_model` | text | `remoto`, `hibrido` ou `presencial` (check) |

### `job_roles`

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | default `auth.uid()`, cascade |
| `title` | text | função procurada |

### `job_sites`

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | default `auth.uid()`, cascade |
| `name` | text | nome do site |
| `url` | text | endereço base |
| `active` | boolean | default `true` |

### `jobs`

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | default `auth.uid()`, cascade |
| `company`, `role`, `site` | text | obrigatórios |
| `url`, `salary`, `status_note` | text | opcionais |
| `status` | `job_status` | default `nova` |
| `external_id` | text | id da vaga no site (deduplicação) |
| `applied_at` | timestamptz | preenchido pelas skills |
| `contract_type` | text | `clt`/`pj` (check) |
| `work_model` | text | `remoto`/`hibrido`/`presencial` (check) |
| `status_updated_at` | timestamptz | default `now()`, atualizado pelo trigger |
| `created_at` | timestamptz | default `now()` |

Restrição: `unique (user_id, site, external_id)` — a mesma vaga não entra duas vezes pelo mesmo site.

### `job_status_history`

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `id` | uuid PK | |
| `job_id` | uuid | references `jobs` (cascade) |
| `status` | `job_status` | status no momento |
| `note` | text | `status_note` da vaga |
| `source` | text | `manual` ou `claude_code` |
| `created_at` | timestamptz | default `now()` |

### `resume_analyses` (1 linha por usuário)

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `user_id` | uuid PK | references `auth.users` (cascade) |
| `resume_path` | text | PDF analisado |
| `model` | text | modelo que gerou a análise |
| `data` | jsonb | análise estruturada |
| `text` | text | texto extraído do PDF |
| `created_at` | timestamptz | default `now()` |

### Enum `job_status`

`nova`, `cadastrado`, `em_processo`, `aprovado`, `reprovado`, `cancelada`.

## Triggers

- **`jobs_touch`** (before update): se o status mudou, atualiza `status_updated_at`.
- **`jobs_log`** (after insert or update): grava em `job_status_history` no insert e a cada mudança de status. A origem é `claude_code` quando a operação vem da service role, senão `manual`.

## RLS

Todas as tabelas têm RLS habilitada:

- `user_settings`, `job_roles`, `job_sites`, `jobs`, `resume_analyses`: policy `own` para tudo, exigindo `user_id = auth.uid()`.
- `job_status_history`: só leitura, e apenas se a vaga pertence ao usuário.

As skills do Claude Code usam a **service role**, que ignora RLS; por isso precisam informar `user_id` explicitamente.

## Storage

- Bucket **`resumes`**, privado.
- Policy `resumes_own`: usuário autenticado só acessa a pasta `<uid>/...`.
- O upload do app usa `<userId>/resume.pdf` com `upsert`.

## Erros comuns

| Sintoma | Causa provável |
| --- | --- |
| `column ... does not exist` | migração nova não aplicada |
| `new row violates check constraint` | valor fora de `clt/pj` ou `remoto/hibrido/presencial` |
| `duplicate key ... jobs_user_id_site_external_id_key` | skill tentando inserir a mesma vaga |
| Lista vazia sem erro | usuário sem linhas ou RLS barrando (verifique o JWT) |
| `permission denied for table` | falta policy ou operação com usuário errado |
