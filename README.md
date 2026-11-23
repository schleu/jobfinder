# jobFinder

Painel para acompanhar o status das vagas. O scraping e a candidatura ficam nas skills do Claude Code, que gravam direto no Supabase.

## Rodando
1. Crie um projeto no Supabase e rode os scripts de `supabase/migrations` no SQL Editor, na ordem (ou `supabase db push`). São idempotentes: podem ser reaplicados sem perder dados.
2. `cp .env.example .env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. `npm install && npm run dev`

## Banco de dados
Os scripts ficam em `supabase/migrations`, aplicados em ordem pelo nome:
- `20261123120000_initial_schema.sql` — tabelas, triggers, RLS e bucket `resumes`.
- `20261123120100_resume_analyses.sql` — tabela com a análise do currículo.

## Chat com IA (gratuito via OpenRouter)
A chave da IA fica na Edge Function, nunca no front.
```bash
supabase link --project-ref <seu-project-ref>
supabase functions deploy chat
supabase secrets set AI_PROVIDER=openrouter AI_API_KEY=sk-or-... AI_MODEL=google/gemma-4-31b-it:free
```
- Crie a chave em <https://openrouter.ai/keys> e escolha um modelo `:free` em <https://openrouter.ai/models?max_price=0> (o padrão muda com o tempo; ajuste `AI_MODEL` se necessário).
- `AI_PROVIDER` aceita qualquer provedor compatível com a API da OpenAI (`openrouter`, `groq`, `openai`, `deepseek`, `mistral`).
- A função autentica pelo JWT do usuário e lê só as vagas dele (RLS), então o bot responde sobre o painel de verdade.
- Para testar local: `supabase functions serve chat --env-file .env` com as variáveis `AI_*` no `.env`.

## Análise do currículo com IA
A aba **Currículo** envia o PDF para o bucket `resumes` e pede à mesma IA uma análise estruturada: nota geral, pontos fortes, lacunas, palavras-chave, sugestões e aderência às funções procuradas em Configurações.
```bash
supabase functions deploy analyze-resume
```
- Usa os mesmos secrets `AI_*` da função `chat` — não precisa configurar nada novo.
- O texto do PDF é extraído dentro da função com `unpdf`; PDFs escaneados (sem texto selecionável) são recusados com aviso.
- A última análise fica salva em `resume_analyses` (uma por usuário). Para aplicar no banco:
  - projeto existente: rode `supabase/migrations/20261123120100_resume_analyses.sql`;
  - projeto novo: rode os dois arquivos de `supabase/migrations` na ordem (ou `supabase db push`).
- Para testar local: `supabase functions serve analyze-resume --env-file .env`.

## Para as skills do Claude Code
- Use `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS) e informe `user_id` em cada insert.
- Preencha `external_id` (id da vaga no site) para evitar duplicatas.
- Ao mudar `status` (e `status_note`), o histórico é gravado sozinho por trigger, com origem `claude_code`.
