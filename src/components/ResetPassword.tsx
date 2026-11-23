import { useState } from 'react';
import { supabase } from '../lib/supabase';
import PasswordInput from './PasswordInput';

export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) setError(updateError.message);
    else setDone(true);
  };

  const cancel = () => {
    supabase.auth.signOut().finally(onDone);
  };

  if (done) {
    return (
      <div className="card auth">
        <h1>Senha atualizada</h1>
        <p className="muted">Você já está conectado com a nova senha.</p>
        <button className="primary" onClick={onDone}>Continuar</button>
      </div>
    );
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>Definir nova senha</h1>
      <p className="muted">Escolha uma senha nova para a sua conta.</p>
      <PasswordInput
        value={password}
        onChange={setPassword}
        placeholder="Nova senha"
        autoComplete="new-password"
        disabled={busy}
      />
      <PasswordInput
        value={confirm}
        onChange={setConfirm}
        placeholder="Confirme a nova senha"
        autoComplete="new-password"
        disabled={busy}
      />
      <button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
      <button type="button" className="link" onClick={cancel} disabled={busy}>Cancelar</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
