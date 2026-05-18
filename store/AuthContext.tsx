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

const fetchUserProfile = async (uid: string, email?: string): Promise<User | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  // 1. Tenta buscar o perfil pelo ID real (UID do Auth)
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', uid)
    .single();
    
  if (!error && data) {
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
  }

  // 2. Se não encontrou por ID, mas temos o e-mail, tenta buscar por E-MAIL (Cenário de vinculação)
  if (email) {
    const { data: dataByEmail } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (dataByEmail) {
      console.log("Perfil encontrado por e-mail, mas com ID diferente. Atualizando ID para:", uid);
      // Vincula o registro existente ao UID real do Auth
      const { data: updatedData, error: updateError } = await supabase
        .from('users')
        .update({ id: uid })
        .eq('email', email)
        .select()
        .single();

      if (!updateError && updatedData) {
        return {
          id: updatedData.id,
          email: updatedData.email,
          name: updatedData.name,
          role: updatedData.role as UserRole,
          isActive: updatedData.is_active ?? updatedData.isActive ?? true,
          permissions: updatedData.permissions,
        };
      }
    }

    // 3. Se ainda não existir nem por e-mail nem por ID, cria um novo (Auto-provisionamento)
    if (error?.code === 'PGRST116' || !dataByEmail) {
      console.log("Criando novo perfil para usuário:", email);
      const newUser = {
        id: uid,
        email: email,
        name: email.split('@')[0],
        role: UserRole.ADMIN,
        is_active: true,
        permissions: {
          canViewDashboard: true,
          canManageQuotas: true,
          canSimulate: true,
          canViewReports: true,
          canManageSettings: true,
          canMarkQuotas: true,
          allowedCompanyIds: [],
        }
      };

      const { data: createdData, error: createError } = await supabase
        .from('users')
        .insert(newUser)
        .select()
        .single();

      if (!createError && createdData) {
        return {
          id: createdData.id,
          email: createdData.email,
          name: createdData.name,
          role: createdData.role as UserRole,
          isActive: createdData.is_active ?? createdData.isActive ?? true,
          permissions: createdData.permissions,
        };
      } else if (createError) {
        console.error("Erro crítico ao criar perfil automático:", createError.message, createError.code);
      }
    }
  }

  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) { setIsLoading(false); return; }

        // Tenta obter a sessão de forma segura
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.warn("Erro ao recuperar sessão:", sessionError.message);
          // Se o token de atualização for inválido ou não encontrado, limpa a sessão local
          if (sessionError.message.includes('refresh_token_not_found') || 
              sessionError.message.includes('Refresh Token Not Found')) {
            await supabase.auth.signOut();
          }
        }

        if (session?.user) {
          const profile = await fetchUserProfile(session.user.id, session.user.email);
          if (profile?.isActive) setUser(profile);
          else await supabase.auth.signOut();
        }
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            const profile = await fetchUserProfile(session.user.id, session.user.email);
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
    
    const trimmedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.');
      throw new Error(error.message);
    }
    
    if (!data.user) throw new Error('Erro inesperado no login.');
    
    const profile = await fetchUserProfile(data.user.id, trimmedEmail);
    if (!profile) { 
      await supabase.auth.signOut(); 
      throw new Error('Perfil não encontrado no banco de dados. Certifique-se de executar o SQL de inicialização nas Configurações.'); 
    }
    
    if (!profile.isActive) { 
      await supabase.auth.signOut(); 
      throw new Error('Usuário inativo. Contate o administrador.'); 
    }
    
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
