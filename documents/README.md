# Documentação do jobFinder

Um arquivo por funcionalidade do app, para consultar como cada parte funciona, onde está o código e o que precisa ser configurado no Supabase.

> O projeto ainda aparece como **jobFinder** na interface; a padronização para **Job Finder** está no `TODO.md`.

## Mapa da documentação

| Documento | O que cobre |
| --- | --- |
| [arquitetura.md](./arquitetura.md) | Stack, estrutura de pastas, fluxo de dados e variáveis de ambiente |
| [autenticacao.md](./autenticacao.md) | Login, cadastro, recuperação de senha e mensagens de erro |
| [vagas.md](./vagas.md) | Tabela de vagas, formulário, status, histórico, contratação e modelo |
| [chat-ia.md](./chat-ia.md) | Chat com IA, seletor de modelo, fallback, adicionar vaga pelo chat e Edge Function `chat` |
| [curriculo.md](./curriculo.md) | Upload do PDF, análise com IA, texto extraído e Edge Function `analyze-resume` |
| [configuracoes.md](./configuracoes.md) | Faixa salarial, preferências, funções procuradas, sites e feedback de salvamento |
| [futuro.md](./futuro.md) | Aba Futuro e o formato do `TODO.md` |
| [banco-de-dados.md](./banco-de-dados.md) | Tabelas, RLS, triggers, storage e migrações |
| [edge-functions.md](./edge-functions.md) | Contratos das funções, deploy, secrets e diagnóstico de erros |
| [desenvolvimento.md](./desenvolvimento.md) | Rodar local, build, deploy e convenções do projeto |

## Visão geral em uma frase

O jobFinder é uma SPA em React + Vite + TypeScript que fala direto com o Supabase (Auth, Postgres, Storage e Edge Functions). O scraping/candidatura ficam nas skills do Claude Code, que gravam no banco com a service role; a IA roda apenas nas Edge Functions, com a chave guardada em secrets.

## Como manter esta documentação

- Ao criar uma funcionalidade nova, crie `documents/<funcionalidade>.md` e adicione uma linha na tabela acima.
- Ao mudar comportamento, atualize o documento correspondente e o `README.md` da raiz.
- Ideias e pendências ficam no `TODO.md` (e aparecem na aba **Futuro**), não aqui.
