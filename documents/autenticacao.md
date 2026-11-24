# Autenticação

Login, cadastro e recuperação de senha usam o **Supabase Auth** direto pelo `supabase-js`. Não há tabela de usuários própria: o Supabase guarda as credenciais em `auth.users` e as tabelas do app referenciam esse id.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/components/Auth.tsx` | Formulário com três modos: `login`, `signup` e `forgot` |
| `src/components/PasswordInput.tsx` | Campo de senha reutilizável, com botão mostrar/ocultar |
| `src/components/ResetPassword.tsx` | Tela de definir nova senha, aberta após o link do e-mail |
| `src/lib/authError.ts` | Traduz erros do Supabase Auth para mensagens claras |
| `src/App.tsx` | Escuta a sessão, trata `PASSWORD_RECOVERY` e erros vindos no hash |

## Fluxos

### Login
1. `supabase.auth.signInWithPassword({ email, password })`.
2. Em caso de sucesso, o listener de `onAuthStateChange` atualiza a sessão e o app renderiza o painel.
3. Em caso de erro, a mensagem passa por `describeAuthError`.

### Cadastro
1. `supabase.auth.signUp({ email, password })`.
2. Se o projeto exigir confirmação de e-mail, o usuário recebe a mensagem “Conta criada. Confirme o e-mail, se exigido.” e só entra depois de confirmar.
3. A senha precisa ter pelo menos 6 caracteres (`minLength` do `PasswordInput`).

### Esqueci minha senha
1. No modo `forgot`, o app chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`.
2. O Supabase envia o e-mail com um link de recuperação (template **Reset Password**).
3. Ao abrir o link, o Supabase cria uma sessão temporária e dispara o evento `PASSWORD_RECOVERY`.
4. `App.tsx` troca a tela pelo `ResetPassword`, que chama `supabase.auth.updateUser({ password })`.
5. A senha é validada duas vezes; se as duas não coincidirem, aparece “As senhas não coincidem.”.
6. Depois de salvar, o usuário já fica conectado e volta ao painel.
7. **Cancelar** faz `signOut()` e volta ao login.

## Tratamento de erros

`describeAuthError` (em `src/lib/authError.ts`) prioriza o `code` do erro:

| Código / condição | Mensagem |
| --- | --- |
| `over_email_send_rate_limit` ou “email rate limit” | Pede para aguardar alguns minutos e sugere configurar SMTP próprio |
| `over_request_rate_limit`, status 429 ou “rate limit” | “Muitas tentativas em pouco tempo…” |
| Outros | Mostra a mensagem original do Supabase |

Link expirado ou inválido volta com `error_description` no hash da URL; `App.tsx` lê esse parâmetro e mostra o aviso na tela de login.

## Configuração no Supabase

- **Authentication → URL Configuration → Redirect URLs**: inclua `http://localhost:5173` e a URL de produção. O app usa `window.location.origin` como destino, então o domínio precisa estar na lista.
- **Authentication → Email Templates → Reset Password**: template do e-mail de recuperação.
- **SMTP**: sem SMTP próprio, o Supabase limita bastante o envio (e o limite gera o erro de rate limit acima).
- O fluxo usa o modo **implícito** do supabase-js (padrão): o link traz a sessão no hash da URL.

## Observações

- A anon key no front é esperada e segura; a proteção real vem da RLS.
- Nenhuma senha é armazenada pelo app.
- O botão mostrar/ocultar do `PasswordInput` usa `aria-pressed` e `aria-label` para acessibilidade.
