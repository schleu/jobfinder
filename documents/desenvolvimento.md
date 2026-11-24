# Desenvolvimento

Guia prático para rodar, alterar e publicar o jobFinder.

## Pré-requisitos

- Node.js 18+ e npm
- Projeto no Supabase
- Supabase CLI para deploy das funções (`npm install -g supabase`)
- Docker apenas para `supabase functions serve` (rodar funções localmente)

## Primeira execução

```bash
# 1. banco
# rode os arquivos de supabase/migrations na ordem no SQL Editor
# ou: supabase link --project-ref <ref> && supabase db push

# 2. variáveis do front
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 3. dependências e dev server
npm install
npm run dev
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Vite em `http://localhost:5173` |
| `npm run build` | `tsc` + build de produção em `dist/` |
| `npm run preview` | serve o build localmente |

Não há testes automatizados nem lint configurados no momento; o `build` é a verificação principal.

## Variáveis

| Variável | Onde | Observação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env` | exposta no bundle |
| `VITE_SUPABASE_ANON_KEY` | `.env` | exposta no bundle (é pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` | só para skills; nunca no front |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | secrets | usadas pelas Edge Functions |
| `AI_MODELS` | secret opcional | lista do seletor de chat |
| `AI_APP_URL` | secret opcional | `HTTP-Referer` do OpenRouter |

`.env` está no `.gitignore`. Não coloque nada secreto com prefixo `VITE_`.

## Estrutura e convenções

- **Componentes** em `src/components`, um por tela/bloco, função default export.
- **Lógica de dados** em `src/hooks` (`useJobs`, `useSettings`, `useResume`), sempre com `error` e `loading`/`busy` expostos.
- **Tipos e constantes compartilhadas** em `src/types.ts`.
- **Helpers** em `src/lib` (cliente Supabase e tradução de erros).
- **Estilos** em `src/styles.css`, tema escuro com variáveis CSS (`--bg`, `--line`, `--accent`, `--muted`).
- **Textos da interface em português do Brasil**; mensagens de erro devem ser claras e acionáveis.
- Toda chamada a Edge Function passa por `describeFunctionError`; toda operação de Auth passa por `describeAuthError`.

## Adicionando uma funcionalidade

1. **Banco**: crie uma migração idempotente em `supabase/migrations` com data no nome (`AAAAAMMDDhhmmss_descricao.sql`), usando `if not exists` e `do $$ ... exception when duplicate_object`.
2. **Tipos**: adicione/estenda em `src/types.ts`.
3. **Hook**: exponha leitura e escrita com tratamento de erro.
4. **UI**: componente em `src/components`, reaproveitando classes existentes (`card`, `row`, `chips`, `primary`, `link`, `muted`).
5. **Feedback**: toda ação que salva precisa de retorno visual (botão com estado ou aviso).
6. **Docs**: atualize `README.md`, crie/atualize o arquivo em `documents/` e mexa no `TODO.md` se a ideia veio de lá.
7. **Build**: rode `npm run build` antes de commitar.

## Checklist de deploy

1. Rodar as migrações novas no SQL Editor (ou `supabase db push`).
2. Redeploy das funções que mudaram:
   ```bash
   supabase functions deploy chat
   supabase functions deploy analyze-resume
   ```
3. Conferir secrets: `supabase secrets list --project-ref <ref>`.
4. Publicar o front (build gerado por `npm run build`).
5. Configurar **Redirect URLs** do Auth com o domínio de produção.

## Problemas comuns

| Sintoma | Onde olhar |
| --- | --- |
| Tela branca ao abrir | `VITE_SUPABASE_URL`/`ANON_KEY` ausentes; console do navegador |
| “Failed to send a request to the Edge Function” | função não publicada ou CORS; ver [edge-functions.md](./edge-functions.md) |
| `column ... does not exist` | migração não aplicada; ver [banco-de-dados.md](./banco-de-dados.md) |
| Lista de vagas vazia | sessão/RLS; confira se está logado no usuário certo |
| E-mail de recuperação não chega | SMTP/limite do Supabase e Redirect URLs |
| IA responde 429 | modelo/provedor limitado; trocar no seletor |
| Upload de PDF recusado | formato, tamanho (>5 MB) ou PDF escaneado |

## Git

Commits em português, no imperativo e com escopo curto (ex.: “Adiciona feedback visual na tela de configurações”). O projeto está em `main` e usa `git push origin main`.
