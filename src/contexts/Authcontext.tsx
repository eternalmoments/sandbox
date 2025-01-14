import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasActivePlan: boolean;
  loading: boolean;
  resetAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [loading, setLoading] = useState(true); // Inicializado como `true` para indicar carregamento inicial
  const navigate = useNavigate();

  const resetAuth = () => {
    setUser(null);
    setHasActivePlan(false);
    setLoading(false);
    localStorage.clear();
    navigate('/login'); // Redireciona para a tela de login
  };

  const fetchUserProfile = async (userId: string): Promise<User | null> => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
      if (sessionError) {
        console.error('Erro ao obter sessão:', sessionError);
        throw sessionError;
      }
  
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, subscription_status, stripe_customer_id')
        .eq('id', userId)
        .single();
  
      if (profileError) {
        console.error('Erro ao buscar perfil:', profileError);
        throw profileError;
      }
  
      return profile
        ? {
            id: userId,
            email: session?.user?.email || '',
            name: profile.name || '',
            subscriptionStatus: profile.subscription_status,
            stripeCustomerId: profile.stripe_customer_id,
          }
        : null;
    } catch (error) {
      console.error('Erro ao buscar perfil do usuário:', error);
      return null;
    }
  };
  

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session?.user && mounted) {
          const userProfile = await fetchUserProfile(session.user.id);

          if (userProfile && mounted) {
            setUser(userProfile);
            setHasActivePlan(userProfile.subscriptionStatus === 'active');
          }
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        resetAuth();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetAuth();
      } else if (event === 'SIGNED_IN' && session?.user) {
        fetchUserProfile(session.user.id).then((userProfile) => {
          if (userProfile) {
            setUser(userProfile);
            setHasActivePlan(userProfile.subscriptionStatus === 'active');
            navigate('/dashboard');
          }
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = (userData: User) => {
    setUser(userData);
    setHasActivePlan(userData.subscriptionStatus === 'active');
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      resetAuth();
    } catch (error) {
      console.error('Erro ao deslogar:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login: handleLogin,
        logout: handleLogout,
        isAuthenticated: !!user,
        hasActivePlan,
        loading,
        resetAuth,
      }}
    >
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
