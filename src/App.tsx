import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import JobsTable from './components/JobsTable';
import SettingsPanel from './components/SettingsPanel';
import ChatPanel from './components/ChatPanel';
import ResumePanel from './components/ResumePanel';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'vagas' | 'chat' | 'curriculo' | 'config'>('vagas');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <main className="center"><Auth /></main>;
  return (
    <main>
      <header>
        <h1>jobFinder</h1>
        <nav>
          <button className={tab === 'vagas' ? 'tab on' : 'tab'} onClick={() => setTab('vagas')}>Vagas</button>
          <button className={tab === 'chat' ? 'tab on' : 'tab'} onClick={() => setTab('chat')}>Chat IA</button>
          <button className={tab === 'curriculo' ? 'tab on' : 'tab'} onClick={() => setTab('curriculo')}>Currículo</button>
          <button className={tab === 'config' ? 'tab on' : 'tab'} onClick={() => setTab('config')}>Configurações</button>
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      {tab === 'vagas' && <JobsTable />}
      {tab === 'chat' && <ChatPanel userId={session.user.id} />}
      {tab === 'curriculo' && <ResumePanel userId={session.user.id} />}
      {tab === 'config' && <SettingsPanel userId={session.user.id} />}
    </main>
  );
}
