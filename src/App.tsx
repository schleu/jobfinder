import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import JobsTable from './components/JobsTable';
import SettingsPanel from './components/SettingsPanel';
import ChatPanel from './components/ChatPanel';
import ResumePanel from './components/ResumePanel';
import RoadmapPanel from './components/RoadmapPanel';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'vagas' | 'chat' | 'curriculo' | 'futuro' | 'config'>('vagas');

  useEffect(() => {
    // Link expirado/inválido volta com o erro no hash (ex.: e-mail de recuperação vencido).
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDescription = params.get('error_description');
    if (errorDescription) setAuthNotice(errorDescription);

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (s) setAuthNotice(null);
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (recovering) return <main className="center"><ResetPassword onDone={() => setRecovering(false)} /></main>;
  if (!session) return <main className="center"><Auth notice={authNotice} /></main>;
  return (
    <main>
      <header>
        <h1>jobFinder</h1>
        <nav>
          <button className={tab === 'vagas' ? 'tab on' : 'tab'} onClick={() => setTab('vagas')}>Vagas</button>
          <button className={tab === 'chat' ? 'tab on' : 'tab'} onClick={() => setTab('chat')}>Chat IA</button>
          <button className={tab === 'curriculo' ? 'tab on' : 'tab'} onClick={() => setTab('curriculo')}>Currículo</button>
          <button className={tab === 'futuro' ? 'tab on' : 'tab'} onClick={() => setTab('futuro')}>Futuro</button>
          <button className={tab === 'config' ? 'tab on' : 'tab'} onClick={() => setTab('config')}>Configurações</button>
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      {tab === 'vagas' && <JobsTable />}
      {tab === 'chat' && <ChatPanel userId={session.user.id} />}
      {tab === 'curriculo' && <ResumePanel userId={session.user.id} />}
      {tab === 'futuro' && <RoadmapPanel />}
      {tab === 'config' && <SettingsPanel userId={session.user.id} />}
    </main>
  );
}
