import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/database';
import { getSupabase } from '../services/supabaseClient';

interface AuthContextType {
  user: User | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: keyof User['permissions']) => boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Função para buscar o perfil completo na tabela 'users'
  const fetchUserProfile = async (uid: string): Promise<User | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

      if (error) {
        console.error("Perfil não encontrado na tabela 'users' para o UID:", uid);
        return null;
      }

      // Converte do formato do banco para o formato do App
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role as UserRole,
        isActive: data.is_active,
        permissions: data.permissions
      };
    } catch (err) {
      console.error("Erro ao buscar perfil:", err);
      return null;
    }
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // 1. Verifica se já existe uma sessão ativa ao carregar o app
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        setUser(profile);
      }
      setIsLoading(false);
    };

    checkSession();

    // 2. Escuta mudanças no estado de autenticação (Login, Logout, Token renovado)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        setUser(profile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password?: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Conexão com o banco não configurada.');
    if (!password) throw new Error('A senha é obrigatória para o login oficial.');

    // Autenticação oficial no Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Tradução de erros comuns
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('E-mail ou senha incorretos.');
      }
      throw new Error(error.message);
    }

    if (data.user) {
      const profile = await fetchUserProfile(data.user.id);
      if (profile && !profile.isActive) {
        await supabase.auth.signOut();
        throw new Error('Sua conta está inativa. Entre em contato com o administrador.');
      }
      setUser(profile);
    }
  };

  const logout = async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  const hasPermission = (permission: keyof User['permissions']) => {
    if (!user) return false;
    // Administradores têm permissão total por padrão
    if (user.role === UserRole.ADMIN) return true;
    return user.permissions[permission] === true;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      hasPermission,
      isAdmin: user?.role === UserRole.ADMIN,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
