# Chat com IA

O chat responde perguntas sobre as vagas do usuário. A chamada ao provedor de IA acontece **somente** na Edge Function `chat`; o front nunca vê a chave.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/components/ChatPanel.tsx` | Interface, seletor de modelo, histórico local, renderização das respostas e fluxo de adicionar vaga |
| `src/components/JobDraftCard.tsx` | Cartão editável de confirmação da vaga extraída pela IA |
| `src/lib/jobSites.ts` | Adiciona o site da vaga em Configurações quando ele ainda não existe |
| `supabase/functions/chat/index.ts` | Autenticação, contexto das vagas, extração de vaga, chamada à IA e fallback de modelos |
| `supabase/functions/chat/scrape.ts` | Raspagem do link: APIs do site, JSON-LD, dados embutidos de SPAs e meta tags |
| `src/lib/edgeFunction.ts` | Traduz erros de `functions.invoke` |

## Interface

- **Seletor de modelo** no topo. A lista vem da própria função (`{ action: 'models' }`) e respeita o secret opcional `AI_MODELS`; se a chamada falhar, usa a lista embutida.
- A escolha fica salva em `localStorage` por usuário (`jobfinder:model:<userId>`).
- **Histórico** também fica no navegador (`jobfinder:chat:<userId>`), limitado às 50 mensagens mais recentes; **Limpar conversa** apaga.
- Sugestões iniciais clicáveis quando a conversa está vazia.
- **+ Nova vaga** (ou **+ Adicionar vaga**) preenche o campo com `Adicionar vaga: ` para você colar o link ou descrever os dados.
- Markdown mínimo: parágrafos, títulos, bullets, **negrito** e `código`.
- Rodapé mostra qual modelo respondeu e avisa quando houve **fallback automático**.
- `Enter` envia, `Shift+Enter` quebra linha.

## Adicionar vaga pelo chat

Quando a última mensagem do usuário pede para cadastrar uma vaga (ou contém um link), a Edge Function muda o modo: em vez de responder sobre as vagas, ela **extrai um rascunho** e devolve junto com a resposta.

1. O front envia a conversa normalmente.
2. A função detecta a intenção (`adicionar`, `cadastrar`, `salvar`… + `vaga`, ou um link praticamente sozinho / acompanhado de “vaga”).
3. Se houver link, a função faz o **scraping** da página (`scrape.ts`): tenta primeiro a API pública do site (LinkedIn guest, Greenhouse, Lever), depois o **JSON-LD `JobPosting`**, os dados embutidos de SPAs (`__NEXT_DATA__`, `__INITIAL_STATE__`, `__APOLLO_STATE__` etc.), as meta tags (`og:*`) e, por fim, o texto visível. Timeout de 15 s, até 4 redirecionamentos e hosts internos bloqueados.
4. A IA recebe a mensagem, o link e todo o material raspado (dados estruturados + texto) e responde só com um JSON de vaga.
5. O front valida o JSON e mostra o **cartão de confirmação** (`JobDraftCard`), com todos os campos editáveis.
6. Ao confirmar, a vaga é inserida em `jobs` e o site é adicionado em `job_sites` se ainda não existir (com URL do link ou de uma lista de sites conhecidos).

O cartão nunca salva sozinho: o usuário revisa empresa, função, site, link, salário, contratação, modelo, status e observação antes de confirmar. Duplicatas (mesmo link ou mesma empresa + função + site) são recusadas com “Essa vaga já está cadastrada.”.

### Resposta com rascunho

```json
{
  "reply": "Encontrei esta vaga. Revise os campos abaixo e confirme para adicionar.",
  "job": {
    "company": "Acme",
    "role": "Desenvolvedor Frontend",
    "site": "LinkedIn",
    "url": "https://www.linkedin.com/jobs/view/123",
    "salary": "R$ 8.000",
    "contract_type": "clt",
    "work_model": "remoto",
    "status": "nova",
    "status_note": "React, TypeScript"
  },
  "model": "modelo usado",
  "requested_model": "modelo pedido",
  "fallback": false
}
```

Se a IA falhar mas o link tiver dados estruturados, a função ainda devolve um rascunho parcial para o usuário completar. Se não houver nada aproveitável, devolve o erro normal (429, 502 etc.).

### Limitações

- Sites com login ou anti-bot (alguns portais) podem bloquear a leitura da página. Quando o site é reconhecido, a função tenta a API pública (LinkedIn guest, Greenhouse, Lever) antes de baixar o HTML; se nada funcionar, a IA usa o link e o texto da mensagem, e o cartão serve para completar o que faltar.
- O scraping não executa JavaScript: páginas que só montam a vaga no navegador são lidas pelos dados embutidos (quando existem) ou pelo texto/meta tags disponíveis no HTML.
- A IA pode errar ou inventar um campo; por isso o cartão é sempre uma etapa de revisão e nada é salvo sem confirmação.
- O link é aberto pela Edge Function, não pelo navegador; hosts internos (`localhost`, faixas privadas) são bloqueados.

## Contrato da Edge Function `chat`

### `POST` com `{ "action": "models" }`

```json
{ "models": ["openrouter/free", "google/gemma-4-31b-it:free"], "default": "google/gemma-4-31b-it:free" }
```

### `POST` com `{ "messages": [...], "model": "..." }`

- `messages`: até as 12 últimas mensagens, cada uma cortada em 4.000 caracteres; a última precisa ser do usuário.
- `model`: aceito apenas se estiver na allowlist; fora dela, cai no modelo padrão.
- Resposta de sucesso:

```json
{ "reply": "texto", "model": "modelo usado", "requested_model": "modelo pedido", "fallback": false }
```

### Erros

| Status | Quando |
| --- | --- |
| 400 | corpo inválido ou sem mensagem do usuário |
| 401 | sem `Authorization` ou JWT inválido |
| 405 | método diferente de `POST`/`OPTIONS` |
| 500 | provedor não suportado, `AI_API_KEY` ausente ou falha ao ler as vagas |
| 502 | IA respondeu erro, resposta inesperada ou todos os modelos limitados (429) |

## Como o contexto é montado

1. Autentica com o JWT do usuário (`supabase.auth.getUser()`).
2. Lê até 100 vagas do usuário (RLS garante o escopo), com empresa, função, site, link, salário, contratação, modelo, status, observação e datas.
3. Lê as preferências em `user_settings` (`contract_type`, `work_model`).
4. Monta um system prompt em português com resumo por status, lista de vagas e preferências.
5. Envia `temperature: 0.4` e `max_tokens: 900`.

## Modelos e fallback

- Lista padrão embutida no código: `openrouter/free`, `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `inclusionai/ling-3.2-flash:free`, `nvidia/nemotron-3.5-super-vl:free`, `baidu/ernie-5.5-flash-preview:free`, `nvidia/nemotron-3.5-lightning:free`.
- O secret `AI_MODELS` (IDs separados por vírgula) substitui a lista; o `AI_MODEL` padrão sempre entra.
- Se o modelo escolhido devolver **429 ou 5xx**, a função tenta os próximos da lista (até 3 tentativas, 40 s cada) e informa `fallback: true`.
- Se todos falharem com 429: “Os modelos testados estão temporariamente limitados (429)…”.

## Configuração e deploy

```bash
supabase functions deploy chat
supabase secrets set AI_PROVIDER=openrouter AI_API_KEY=sk-or-... AI_MODEL=google/gemma-4-31b-it:free
```

- `AI_PROVIDER` aceita `openrouter`, `groq`, `openai`, `deepseek` e `mistral` (todos no formato OpenAI).
- Segredos valem para `chat` e `analyze-resume` ao mesmo tempo; não precisa redeploy ao trocar um secret.
- Teste local: `supabase functions serve chat --env-file .env` (precisa de Docker).
- Modelos `:free` têm limite diário por conta e limites por provedor; créditos no OpenRouter aumentam o limite.

## Diagnóstico

- **“A função chat não foi encontrada”**: a função não está publicada — rode o deploy.
- **“AI_API_KEY não configurada…”**: falta o secret.
- **401 / “Sessão inválida”**: token expirado; entrar novamente.
- **429**: modelo/provedor limitado; trocar no seletor ou usar `openrouter/free`.
- `functions.invoke` sem `content-type` em respostas 404 pode virar erro de rede; `describeFunctionError` cobre os dois casos.
