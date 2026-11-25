# Configurações

A aba **Configurações** reúne o que a IA usa como contexto e o que alimenta a tabela de vagas: faixa salarial, preferências de vaga, funções procuradas e sites de busca.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/components/SettingsPanel.tsx` | Cards, formulários e feedback visual |
| `src/hooks/useSettings.ts` | Carrega e salva configurações, funções e sites |
| `src/types.ts` | `Settings`, `JobRole`, `JobSite`, enums de contratação/modelo |

## Cards

### Faixa salarial
- Campos **Mínimo** e **Máximo** (numéricos). Vazio vira `null`.
- Salva em `user_settings.salary_min` e `salary_max`.
- Usada no prompt da análise do currículo.

### Preferências de vaga
- **Contratação**: `Sem preferência`, `CLT` ou `PJ`.
- **Modelo de trabalho**: `Sem preferência`, `Remoto`, `Híbrido` ou `Presencial`.
- Salva em `user_settings.contract_type` e `work_model`.
- Entram no contexto do chat e da análise do currículo.

### Funções procuradas
- Lista em `job_roles` (título livre).
- É a base da seção **Aderência às funções procuradas** na análise do currículo.
- `Enter` no campo também adiciona.
- Adicionar/remover mostra um aviso temporário.

### Sites de vagas
- Lista em `job_sites` (`name`, `url`, `active`).
- **Pausar/Ativar** alterna `active`; **Remover** apaga.
- O site pausado aparece esmaecido e pode ser usado pelas skills para decidir onde buscar.
- Ao adicionar uma vaga pelo chat, o site é criado automaticamente aqui quando ainda não existe (`src/lib/jobSites.ts`).

## Feedback visual

O usuário sempre recebe confirmação:

- Botões de salvar mostram **“Salvando…”** durante a requisição e **“Salvo ✓”** (verde) por ~2,5 s depois.
- Ações de lista (funções e sites) mostram um aviso no topo do painel: “Função adicionada.”, “Site removido.”, “Site pausado.” etc.
- Erros aparecem em vermelho no topo, com `role="alert"`.
- O aviso de sucesso usa `role="status"` e `aria-live="polite"`.

O componente `SaveButton` (dentro de `SettingsPanel.tsx`) recebe `onSave: () => Promise<boolean>`; o `true/false` vem de `useSettings.run`, que retorna se a operação deu certo.

## Contrato do `useSettings`

```ts
{
  settings, roles, sites, error,
  saveSettings(patch),           // Promise<boolean>
  addRole(title), removeRole(id),
  addSite(name, url), removeSite(id),
  toggleSite(site),
}
```

- `load()` faz três consultas em paralelo (`user_settings`, `job_roles`, `job_sites`) e junta os erros.
- Toda ação passa por `run()`, que limpa o erro, executa, recarrega e devolve sucesso.
- `saveSettings` faz `upsert` com `user_id` + settings atuais + patch, então não zera os outros campos.

## Dados no banco

- `user_settings`: uma linha por usuário (PK `user_id`), com `resume_path`, `salary_min`, `salary_max`, `contract_type`, `work_model`.
- `job_roles`: `id`, `user_id`, `title`.
- `job_sites`: `id`, `user_id`, `name`, `url`, `active`.

Detalhes e RLS em [banco-de-dados.md](./banco-de-dados.md).

## Observações

- Sem a migração `20261124120000_job_contract_work_model.sql`, os selects de preferência falham; rode a migração.
- As funções procuradas também podem ser alimentadas pelas skills do Claude Code (com `user_id`).
- O feedback de “faixa salarial salva” saiu do `TODO.md` e está implementado.
