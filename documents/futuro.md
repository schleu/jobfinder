# Aba Futuro

A aba **Futuro** transforma o `TODO.md` da raiz em uma lista visual de features, com progresso. Não há banco nem API: o arquivo é lido em tempo de build.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/components/RoadmapPanel.tsx` | Parser do Markdown e renderização |
| `TODO.md` | Fonte das ideias, na raiz do projeto |

## Como funciona

- `import todoRaw from '../../TODO.md?raw'` — o Vite embute o conteúdo do arquivo no bundle.
- O parser percorre as linhas:
  - `## Título` cria uma seção;
  - `- [ ] item` / `- [x] item` cria um item (marcado ou concluído);
  - itens com **2 ou mais espaços** de indentação viram filhos do item anterior;
  - blocos de código ( cercados por ``` ) e comentários `<!-- -->` são ignorados;
  - seções sem itens são ocultadas.
- O topo mostra **“X de Y concluídas”** e uma barra de progresso.
- Itens concluídos aparecem riscados.

## Formato aceito

```md
## Seção

- [ ] **Título curto** — o que fazer e por quê
  - [ ] subitem
  - [x] subitem já feito

## Concluídas

- 2026-11-24 — Algo que foi entregue.
```

Regras práticas:

- Use apenas **um nível** de indentação (o parser não faz árvores mais profundas).
- Subtítulos (`###`) não são interpretados.
- Links, tabelas e imagens não são renderizados; o texto aparece como está (com negrito, `código` e _itálico_).
- A seção **Concluídas** é texto livre; as linhas com `- ` sem checkbox também aparecem como itens (sem caixa marcada).

## Como adicionar uma ideia

1. Edite o `TODO.md`.
2. Coloque a ideia na seção correspondente (ou crie uma nova com `##`).
3. Rode `npm run dev` — o Vite recarrega o módulo e a aba já mostra a mudança.
4. Em produção, a lista só muda depois de um novo build/deploy do front.

## Limitações

- O conteúdo é fixo no bundle: não é possível editar o TODO pelo app.
- O parser é simples de propósito; formatos muito diferentes do modelo acima podem não aparecer.
- Não há contagem por seção, só o total.
