import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TIMEOUT-SCHUTZ: nach 4s loading beenden egal was
    const timeout = setTimeout(() => setLoading(false), 4000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            const { data } = await supabase
              .from('user_roles').select('role')
              .eq('user_id', session.user.id).eq('role', 'admin').maybeSingle();
            setIsAdmin(!!data);
          } catch { setIsAdmin(false); }
        } else {
          setIsAdmin(false);
        }
        clearTimeout(timeout);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('user_roles').select('role')
          .eq('user_id', session.user.id).eq('role', 'admin').maybeSingle()
          .then(({ data }) => setIsAdmin(!!data))
          .catch(() => setIsAdmin(false))
          .finally(() => { clearTimeout(timeout); setLoading(false); });
      } else {
        clearTimeout(timeout);
        setLoading(false);
      }
    }).catch(() => { clearTimeout(timeout); setLoading(false); });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
