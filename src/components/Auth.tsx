import { useState } from 'react';
import { supabase } from '../lib/supabase';
import PasswordInput from './PasswordInput';

type Mode = 'login' | 'signup' | 'forgot';

export default function Auth({ notice }: { notice?: string | null }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setMsg(null);
    setOk(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      setBusy(false);
      setOk(!error);
      setMsg(
        error
          ? error.message
          : 'Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Confira também a caixa de spam.',
      );
      return;
    }

    const { error } = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    setOk(!error);
    setMsg(error ? error.message : mode === 'signup' ? 'Conta criada. Confirme o e-mail, se exigido.' : null);
  };

  const label = mode === 'forgot' ? 'Enviar link' : mode === 'signup' ? 'Criar conta' : 'Entrar';

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>jobFinder</h1>
      {notice && <p className="error">{notice}</p>}
      {mode === 'forgot' && (
        <p className="muted">Informe seu e-mail e enviaremos um link para você criar uma nova senha.</p>
      )}
      <input
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        disabled={busy}
      />
      {mode !== 'forgot' && (
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="Senha"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          disabled={busy}
        />
      )}
      <button className="primary" disabled={busy}>{busy ? 'Aguarde…' : label}</button>
      {mode === 'login' && (
        <>
          <button type="button" className="link" onClick={() => switchMode('forgot')}>Esqueci minha senha</button>
          <button type="button" className="link" onClick={() => switchMode('signup')}>Criar uma conta</button>
        </>
      )}
      {mode === 'signup' && (
        <button type="button" className="link" onClick={() => switchMode('login')}>Já tenho conta</button>
      )}
      {mode === 'forgot' && (
        <button type="button" className="link" onClick={() => switchMode('login')}>Voltar para o login</button>
      )}
      {msg && <p className={ok ? 'success' : 'error'}>{msg}</p>}
    </form>
  );
}
