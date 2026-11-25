# Arquitetura

## Stack

- **React 18 + TypeScript + Vite 5** — SPA, sem backend próprio.
- **Supabase** — autenticação, Postgres com RLS, Storage (currículos) e Edge Functions (Deno).
- **IA compatível com a API da OpenAI** — via OpenRouter por padrão; Groq, OpenAI, DeepSeek e Mistral também são aceitos.

## Fluxo de dados

```
Navegador (React)
  ├─ supabase-js ──► Auth          (login, cadastro, recuperação de senha)
  ├─ supabase-js ──► Postgres      (jobs, settings, roles, sites, histórico, análises — RLS por usuário)
  ├─ supabase-js ──► Storage       (bucket privado "resumes")
  └─ functions.invoke ──► Edge Functions (chat, analyze-resume)
                            └─► provedor de IA (chave nos secrets)

Claude Code (skills)
  └─ service role ──► Postgres (ignora RLS; precisa informar user_id)
```

Pontos importantes:

- O front usa apenas a **anon key** (`VITE_*`). A **service role** fica só nas skills.
- A **chave da IA** fica só nos secrets das Edge Functions (`AI_*`), nunca no bundle.
- As Edge Functions recebem o JWT do usuário e consultam o banco com esse token, então a RLS continua valendo.

## Estrutura de pastas

```
src/
  App.tsx                 sessão, abas e tela de recuperação de senha
  main.tsx                bootstrap do React
  styles.css              estilos globais (tema escuro, tabelas, cards, chat…)
  types.ts                tipos e constantes compartilhadas (status, contratação, modelo)
  components/
    Auth.tsx              login / cadastro / esqueci minha senha
    PasswordInput.tsx     campo de senha com botão mostrar/ocultar
    ResetPassword.tsx     definição de nova senha (PASSWORD_RECOVERY)
    JobsTable.tsx         tabela de vagas, filtros e histórico
    JobForm.tsx           formulário de nova vaga
    JobDraftCard.tsx      confirmação da vaga extraída pelo chat
    ChatPanel.tsx         chat com IA, seletor de modelo, histórico local e cadastro de vaga
    ResumePanel.tsx       upload e resultado da análise do currículo
    RoadmapPanel.tsx      aba Futuro (lê o TODO.md)
    SettingsPanel.tsx     faixa salarial, preferências, funções e sites
  hooks/
    useJobs.ts            leitura, criação e atualização de vagas
    useSettings.ts        configurações, funções procuradas e sites
    useResume.ts          upload, análise e persistência do currículo
  lib/
    supabase.ts           cliente Supabase (anon key)
    edgeFunction.ts       tradução de erros de Edge Functions
    authError.ts          tradução de erros de autenticação
    jobSites.ts           cadastro automático do site da vaga
supabase/
  migrations/             scripts SQL idempotentes, aplicados em ordem
  functions/
    chat/index.ts         chatbot com as vagas do usuário
    analyze-resume/index.ts  extração do PDF + análise estruturada
```

## Abas do app

Definidas em `src/App.tsx`: **Vagas**, **Chat IA**, **Currículo**, **Futuro** e **Configurações**. A aba ativa fica em estado local (não persiste ao recarregar).

## Variáveis de ambiente

| Variável | Onde vive | Para que serve |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env` (front) | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `.env` (front) | Chave pública usada pelo supabase-js |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (skills) | Skills do Claude Code; ignora RLS |
| `AI_PROVIDER` | secrets das Edge Functions | `openrouter`, `groq`, `openai`, `deepseek` ou `mistral` |
| `AI_API_KEY` | secrets das Edge Functions | Chave do provedor de IA |
| `AI_MODEL` | secrets das Edge Functions | Modelo padrão (ex.: `google/gemma-4-31b-it:free`) |
| `AI_MODELS` | secrets das Edge Functions (opcional) | Lista do seletor de modelo, separada por vírgula |
| `AI_APP_URL` | secrets das Edge Functions (opcional) | Cabeçalho `HTTP-Referer` enviado ao OpenRouter |

## Decisões de projeto

- **Sem servidor intermediário**: o front conversa direto com o Supabase; a segurança vem da RLS e do JWT.
- **Análises e histórico no banco**: o chat guarda o histórico no `localStorage`; a análise do currículo fica em `resume_analyses`.
- **Migrações idempotentes**: podem ser reaplicadas sem perder dados (ver [banco-de-dados.md](./banco-de-dados.md)).
- **UI em português do Brasil**, mensagens de erro traduzidas em `lib/authError.ts` e `lib/edgeFunction.ts`.
