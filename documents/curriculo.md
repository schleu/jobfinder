# Currículo e análise com IA

A aba **Currículo** envia um PDF para o Storage, extrai o texto dentro da Edge Function e pede à IA uma análise estruturada, com nota geral e aderência às funções procuradas.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/components/ResumePanel.tsx` | Upload, botão de análise e exibição do resultado |
| `src/hooks/useResume.ts` | Validação, upload, chamada da função e persistência |
| `supabase/functions/analyze-resume/index.ts` | Extração do PDF, prompt, normalização e resposta |
| `src/types.ts` | `ResumeAnalysis`, `ResumeAnalysisRow` |

## Upload

- O arquivo vai para o bucket privado **`resumes`**, no caminho `<userId>/resume.pdf` (upsert: substitui o anterior).
- Antes de enviar, `validateResumeFile` recusa:
  - tipo/extensão diferente de PDF;
  - arquivo vazio;
  - arquivo acima de **5 MB**;
  - conteúdo sem a assinatura `%PDF-` (pega arquivo renomeado).
- Depois do upload, a análise anterior é apagada (não vale mais para o novo PDF) e o caminho é salvo em `user_settings.resume_path`.
- O upload preserva a faixa salarial e as preferências já salvas.

## Análise

`supabase.functions.invoke('analyze-resume', { body: {} })` — sem payload; a função usa o currículo do próprio usuário.

Dentro da função:

1. Autentica pelo JWT.
2. Lê `user_settings` (`resume_path`, faixa salarial, contratação e modelo) e baixa o PDF do Storage.
3. Extrai o texto com **`unpdf`** (`extractText`).
4. Recusa PDFs com menos de **200 caracteres** (provavelmente escaneados) e trunca em **14.000 caracteres**.
5. Lê as funções procuradas em `job_roles`.
6. Pede à IA um JSON com `temperature: 0.3`, `max_tokens: 3.000` e `response_format: json_object`. Se o provedor recusar o formato (400/422), tenta de novo sem ele.
7. Se a resposta vier sem texto, tenta mais uma vez sem `response_format` e, se ainda assim falhar, passa para o próximo modelo de `AI_MODELS` (até 3 no total).
8. Normaliza a resposta (ver abaixo) e devolve `{ analysis, model, resume_path, chars, text }`.

A leitura da resposta é tolerante: aceita `content` como string ou lista de partes, usa `reasoning`/`reasoning_content` como último recurso e identifica `finish_reason: "length"` para avisar que o limite de tokens acabou.

## Formato da análise

```json
{
  "resumo": "2 a 4 frases",
  "nivel": "estágio | júnior | pleno | sênior | não identificado",
  "anos_experiencia": 0,
  "pontos_fortes": ["..."],
  "pontos_fracos": ["..."],
  "palavras_chave": ["..."],
  "sugestoes": ["..."],
  "aderencia_funcoes": [{ "funcao": "...", "nota": 0, "justificativa": "..." }],
  "nota_geral": 0
}
```

Regras de normalização (modelos gratuitos às vezes fogem do formato):

- notas viram inteiros de 0 a 100; anos de experiência, de 0 a 70;
- listas são deduplicadas e limitadas (até 8 itens; palavras-chave até 12);
- cada função cadastrada que a IA esquecer entra com nota `0` e “Não avaliada pela IA”;
- `nivel` vazio vira “não identificado”; sem `resumo`, a função devolve erro.

## Persistência

Tabela `resume_analyses` (uma linha por usuário, `user_id` é a PK):

| Coluna | Conteúdo |
| --- | --- |
| `resume_path` | caminho do PDF analisado |
| `model` | modelo que gerou a análise |
| `data` | JSON da análise |
| `text` | texto extraído do PDF |
| `created_at` | data da análise |

A gravação é feita pelo front (`upsert`), depois de receber a resposta.

## Exibição

- **Nota geral** com cor por faixa: ≥ 75 verde, ≥ 50 amarelo, abaixo vermelho.
- Resumo, nível e anos de experiência.
- Pontos fortes e pontos a melhorar em duas colunas.
- Palavras-chave como chips.
- Sugestões em lista.
- **Aderência às funções procuradas** com barra e justificativa.
- **Texto extraído do PDF** com botão **Mostrar/Ocultar texto** (análises antigas, sem `text`, não mostram a seção).

## Configuração

```bash
supabase functions deploy analyze-resume
```

- Usa os mesmos secrets `AI_*` do chat.
- Migrações necessárias: `20261123120100_resume_analyses.sql` e `20261123130000_resume_analysis_text.sql`.
- Teste local: `supabase functions serve analyze-resume --env-file .env` (Docker).

## Limitações conhecidas

- PDFs escaneados (imagem) não têm texto selecionável e são recusados.
- Análises antigas não têm o texto salvo; basta clicar em **Reanalisar com IA**.
- A análise ATS mais profunda e a geração de currículo otimizado estão no `TODO.md`.

## Erros comuns

| Mensagem | Causa / solução |
| --- | --- |
| “A IA não retornou texto” | modelo devolveu `content` vazio; a função já tenta de novo e troca de modelo — se persistir, troque `AI_MODEL` |
| “A IA gastou o limite de tokens…” | `finish_reason: length`; tente de novo ou use um modelo com mais saída |
| “A IA devolveu um formato inesperado” | resposta fora do JSON; reanalise ou troque o modelo |
| “A IA respondeu 429” | modelo/provedor limitado; configure `AI_MODELS` com alternativas |
| “AI_API_KEY não configurada…” | falta o secret na Edge Function |
