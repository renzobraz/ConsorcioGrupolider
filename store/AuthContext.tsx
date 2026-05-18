import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { getSupabase } from '../services/supabaseClient';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof User['permissions']) => boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fetchUserProfile = async (uid: string): Promise<User | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', uid)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role as UserRole,
    isActive: data.is_active ?? data.isActive ?? true,
    permissions: data.permissions ?? {
      canViewDashboard: true,
      canManageQuotas: false,
      canSimulate: true,
      canViewReports: false,
      canManageSettings: false,
      canMarkQuotas: false,
      allowedCompanyIds: [],
    },
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) { setIsLoading(false); return; }
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await fetchUserProfile(session.user.id);
          if (profile?.isActive) setUser(profile);
          else await supabase.auth.signOut();
        }
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            const profile = await fetchUserProfile(session.user.id);
            setUser(profile?.isActive ? profile : null);
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
          }
        });
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Conexão com o banco não configurada.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.');
      throw new Error(error.message);
    }
    if (!data.user) throw new Error('Erro inesperado no login.');
    const profile = await fetchUserProfile(data.user.id);
    if (!profile) { await supabase.auth.signOut(); throw new Error('Perfil não encontrado. Contate o administrador.'); }
    if (!profile.isActive) { await supabase.auth.signOut(); throw new Error('Usuário inativo. Contate o administrador.'); }
    setUser(profile);
  };

  const logout = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  };

  const hasPermission = (permission: keyof User['permissions']) => {
    if (!user) return false;
    if (user.role === UserRole.ADMIN) return true;
    return !!user.permissions[permission];
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission, isAdmin: user?.role === UserRole.ADMIN, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};
