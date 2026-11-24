# Edge Functions

Duas funções Deno rodam no Supabase: **`chat`** e **`analyze-resume`**. As duas usam os mesmos secrets `AI_*` e autenticam pelo JWT do usuário.

## Visão geral

| Função | Entrada | Saída | Documento |
| --- | --- | --- | --- |
| `chat` | mensagens + modelo escolhido | resposta da IA | [chat-ia.md](./chat-ia.md) |
| `analyze-resume` | corpo vazio | análise do currículo + texto extraído | [curriculo.md](./curriculo.md) |

Ambas:

- respondem `OPTIONS` para CORS;
- aceitam apenas `POST`;
- exigem `Authorization` e validam com `supabase.auth.getUser()`;
- usam `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` com o header do usuário, então a RLS continua valendo;
- devolvem JSON com `{ error }` e status adequado em caso de falha.

## Secrets

```bash
supabase secrets set \
  AI_PROVIDER=openrouter \
  AI_API_KEY=sk-or-... \
  AI_MODEL=google/gemma-4-31b-it:free
# opcional
supabase secrets set AI_MODELS=modelo-a:free,modelo-b:free
```

- Nome de secret não pode começar com `SUPABASE_` (reservado).
- Trocar secret **não** exige redeploy; a próxima chamada já lê o valor novo.
- Conferir nomes: `supabase secrets list --project-ref <ref>` (mostra nome e digest, nunca o valor).
- Provedores aceitos: `openrouter`, `groq`, `openai`, `deepseek`, `mistral`.

## Deploy

```bash
supabase login
supabase link --project-ref <ref>
supabase functions deploy chat
supabase functions deploy analyze-resume
```

- Deploy **não precisa de Docker**; só `functions serve` precisa.
- Mudou código? Precisa redeploy. Mudou secret? Não.
- Deploy de uma função só: `supabase functions deploy <nome> --project-ref <ref>`.

## Teste local

```bash
supabase functions serve chat --env-file .env
supabase functions serve analyze-resume --env-file .env
```

As variáveis `AI_*` precisam estar no `.env` (sem prefixo `VITE_`).

## Logs

```bash
supabase functions logs chat
supabase functions logs analyze-resume
```

## Códigos de erro

| Status | Significado |
| --- | --- |
| 400 | corpo inválido / requisição malformada |
| 401 | sem token ou sessão inválida |
| 404 | função não publicada (erro do gateway, não do código) |
| 405 | método não permitido |
| 422 | PDF sem texto (escaneado) ou ilegível |
| 500 | configuração ausente (`AI_API_KEY`, provedor inválido) ou falha no banco |
| 502 | erro do provedor de IA, resposta inesperada ou modelos limitados (429) |

## Diagnóstico rápido

- **“Failed to send a request to the Edge Function”**: normalmente a função não está publicada (404 no gateway) ou há erro de CORS. Confira com `curl -i -X OPTIONS <url-da-funcao>` (deve responder 200) e faça o deploy.
- **404 `{"code":"NOT_FOUND"}`**: nome/URL errados ou função não publicada.
- **“AI_API_KEY não configurada…”**: rode `supabase secrets set`.
- **429**: limite do provedor/modelo; o `chat` tenta outros modelos automaticamente.
- **PDF recusado**: menos de 200 caracteres extraídos — provavelmente escaneado.

## Dicas

- A chave da IA nunca deve ir para o front nem para variáveis `VITE_*`.
- Para depurar localmente, os logs da função mostram o status e um trecho da resposta do provedor.
- O corpo de erro do gateway (404) pode não ter `content-type`; por isso o front trata falha de rede em `describeFunctionError`.
