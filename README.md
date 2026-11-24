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
- `20261123130000_resume_analysis_text.sql` — texto extraído do PDF junto da análise.
- `20261124120000_job_contract_work_model.sql` — tipo de contratação e modelo de trabalho (vagas e preferências).

## Vagas
Cada vaga guarda o **tipo de contratação** (`CLT` ou `PJ`) e o **modelo de trabalho** (`Remoto`, `Híbrido` ou `Presencial`). Os campos são escolhidos no formulário e podem ser ajustados direto na tabela, sem abrir a vaga. Campos não informados aparecem como `—`.

Em **Configurações → Preferências de vaga** você define o que procura; essas preferências entram no contexto do chat e da análise do currículo.

## Recuperação de senha
O link **Esqueci minha senha** na tela de login envia um e-mail de redefinição. Ao abrir o link, o app detecta o evento `PASSWORD_RECOVERY` e mostra a tela de definir nova senha (`supabase.auth.updateUser`).
- No Dashboard, em **Authentication → URL Configuration**, adicione `http://localhost:5173` e a URL de produção em **Redirect URLs** — o app usa `window.location.origin` como destino.
- O e-mail usa o template **Reset Password** (Authentication → Email Templates). Sem SMTP próprio o Supabase limita bastante o envio; configure SMTP para uso real.
- O link expira em 1 hora; se expirar, é só pedir outro.

## Chat com IA (gratuito via OpenRouter)
A chave da IA fica na Edge Function, nunca no front.
```bash
supabase link --project-ref <seu-project-ref>
supabase functions deploy chat
supabase secrets set AI_PROVIDER=openrouter AI_API_KEY=sk-or-... AI_MODEL=google/gemma-4-31b-it:free
```
- Crie a chave em <https://openrouter.ai/keys> e escolha um modelo `:free` em <https://openrouter.ai/models?max_price=0> (o padrão muda com o tempo; ajuste `AI_MODEL` se necessário).
- `AI_PROVIDER` aceita qualquer provedor compatível com a API da OpenAI (`openrouter`, `groq`, `openai`, `deepseek`, `mistral`).
- O chat tem um **seletor de modelo** no topo. A lista vem da função e pode ser trocada pelo secret `AI_MODELS` (IDs separados por vírgula); sem ele vale a lista embutida de modelos `:free`, sempre incluindo o `AI_MODEL` padrão.
- Se o modelo escolhido devolver **429/5xx**, a função tenta automaticamente os próximos modelos da lista (até 3) e o rodapé do chat mostra qual respondeu.
- A função autentica pelo JWT do usuário e lê só as vagas dele (RLS), então o bot responde sobre o painel de verdade.
- Para testar local: `supabase functions serve chat --env-file .env` com as variáveis `AI_*` no `.env`.

## Análise do currículo com IA
A aba **Currículo** envia o PDF para o bucket `resumes` e pede à mesma IA uma análise estruturada: nota geral, pontos fortes, lacunas, palavras-chave, sugestões e aderência às funções procuradas em Configurações.
```bash
supabase functions deploy analyze-resume
```
- Usa os mesmos secrets `AI_*` da função `chat` — não precisa configurar nada novo.
- O texto do PDF é extraído dentro da função com `unpdf`; PDFs escaneados (sem texto selecionável) são recusados com aviso.
- O texto extraído volta para o app e aparece na análise, com o botão **Mostrar/Ocultar texto**.
- O upload valida o arquivo antes de enviar: aceita só `.pdf`, até 5 MB, e confere a assinatura `%PDF-` (extensão e MIME podem mentir).
- A última análise fica salva em `resume_analyses` (uma por usuário). Para aplicar no banco:
  - projeto existente: rode `supabase/migrations/20261123120100_resume_analyses.sql`;
  - projeto novo: rode todos os arquivos de `supabase/migrations` na ordem (ou `supabase db push`).
- Para testar local: `supabase functions serve analyze-resume --env-file .env`.

## Aba Futuro
A aba **Futuro** lê o `TODO.md` da raiz em tempo de build (`?raw`) e mostra as ideias organizadas por seção, com caixas de conclusão e uma barra de progresso. Para adicionar uma feature, basta editar o `TODO.md` — nada de mexer no código. Itens concluídos (`- [x]`) aparecem riscados e entram na contagem.

## Para as skills do Claude Code
- Use `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS) e informe `user_id` em cada insert.
- Preencha `external_id` (id da vaga no site) para evitar duplicatas.
- Opcional: preencha `contract_type` (`clt`/`pj`) e `work_model` (`remoto`/`hibrido`/`presencial`).
- Ao mudar `status` (e `status_note`), o histórico é gravado sozinho por trigger, com origem `claude_code`.
