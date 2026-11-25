# Vagas

A aba **Vagas** é a tela principal: lista as candidaturas, permite filtrar por status, adicionar vagas manualmente e editar status, contratação e modelo de trabalho direto na tabela.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/components/JobsTable.tsx` | Tabela, filtros por status, histórico e edição inline |
| `src/components/JobForm.tsx` | Formulário de nova vaga |
| `src/hooks/useJobs.ts` | Leitura, criação e atualização de vagas |
| `src/types.ts` | `Job`, `JobStatus`, `ContractType`, `WorkModel` e labels |

## Tabela

Colunas: **Empresa**, **Função**, **Site**, **Salário**, **Contratação**, **Modelo**, **Status** e **Atualizada**.

- **Função** é um botão: clicar abre/fecha o histórico da vaga na linha de baixo.
- **Contratação** e **Modelo** são selects inline; a alteração é salva na hora (`updateJob`) sem abrir formulário.
- **Status** também é um select inline (`setStatus`) e dispara o histórico automático.
- **Site** vira link quando a vaga tem `url`.
- Campos vazios aparecem como `—` ou `-`.

### Filtros

Chips no topo: **Todas** e um por status, com a contagem de cada um. O filtro é só de interface (não persiste).

### Histórico

Ao abrir uma vaga, `History` busca `job_status_history` por `job_id`, mais recente primeiro, e mostra data, status, origem (`Claude Code` ou `manual`) e observação. O histórico é gravado por trigger no banco — o front nunca insere ali.

## Formulário de nova vaga

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| Empresa | sim | texto livre |
| Função | sim | cargo procurado/anunciado |
| Site | sim | ex.: LinkedIn, Gupy |
| Link da vaga | não | vira link na tabela |
| Salário | não | texto livre (`R$ 8.000`, `a combinar`) |
| Contratação | não | `CLT` ou `PJ` |
| Modelo de trabalho | não | `Remoto`, `Híbrido` ou `Presencial` |
| Status | sim | começa em `Nova` |
| Observação | não | entra no histórico da vaga |

Depois de adicionar, o formulário limpa os campos e mostra “Vaga adicionada.”.

### Adicionar pelo chat

Na aba **Chat IA**, peça para adicionar uma vaga colando o link ou descrevendo os dados (empresa, função, salário…). A IA devolve um rascunho e o app mostra o cartão **Adicionar vaga a partir do chat**, com os campos preenchidos e editáveis. Ao confirmar, a vaga entra em `jobs` e o site é adicionado automaticamente em `job_sites` quando ainda não existe. O fluxo completo está em [chat-ia.md](./chat-ia.md#adicionar-vaga-pelo-chat).

## Status

| Valor | Label |
| --- | --- |
| `nova` | Nova |
| `cadastrado` | Cadastrado |
| `em_processo` | Em processo |
| `aprovado` | Aprovado |
| `reprovado` | Reprovado |
| `cancelada` | Cancelada |

Definidos no enum `job_status` e em `STATUSES` (`src/types.ts`). Para adicionar um status é preciso mexer nos dois lugares (e na migração).

## Contratação e modelo

- `contract_type`: `clt` ou `pj` (coluna `text` com check no banco).
- `work_model`: `remoto`, `hibrido` ou `presencial` (idem).
- Constantes e labels em `src/types.ts` (`CONTRACT_TYPES`, `WORK_MODELS`, `contractLabel`, `workModelLabel`).
- As **preferências** do usuário usam os mesmos valores em `user_settings` e entram no contexto da IA (ver [configuracoes.md](./configuracoes.md)).

## Dados no banco

Tabela `jobs` (detalhes em [banco-de-dados.md](./banco-de-dados.md)):

- `user_id` define o dono (RLS).
- `external_id` + `site` formam a chave de deduplicação: `unique (user_id, site, external_id)`.
- `applied_at` e `status_note` existem no banco; `status_note` vem do campo **Observação**, `applied_at` é preenchido pelas skills.
- `status_updated_at` muda sozinho quando o status muda (trigger `jobs_touch`).

## Skills do Claude Code

As skills gravam direto no Supabase com `SUPABASE_SERVICE_ROLE_KEY`:

- informe sempre `user_id`;
- preencha `external_id` para não duplicar a mesma vaga;
- opcionalmente preencha `contract_type` e `work_model` com os valores acima;
- ao mudar `status`/`status_note`, o trigger registra o histórico com origem `claude_code`.

## Onde mexer

- Novo campo na vaga: migração em `supabase/migrations`, tipo em `src/types.ts`, campo no `JobForm`, coluna/célula na `JobsTable` e `NewJob` em `useJobs.ts`.
- Novo filtro: `JobsTable` (chips) — se for um campo persistido, considere também indexar no banco.
