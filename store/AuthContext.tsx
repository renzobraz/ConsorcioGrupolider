import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/database';

interface AuthContextType {
  user: User | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: keyof User['permissions']) => boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock initial admin user
const DEFAULT_ADMIN: User = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'renzo.amaral@gmail.com',
  name: 'Administrador Geral',
  password: '123',
  role: UserRole.ADMIN,
  isActive: true,
  permissions: {
    canViewDashboard: true,
    canManageQuotas: true,
    canSimulate: true,
    canViewReports: true,
    canManageSettings: true,
    canMarkQuotas: true,
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        let users: User[] = [];
        const isCloud = db.isCloudEnabled();
        
        if (isCloud) {
          // Em ambiente nuvem, tentamos buscar a lista para o bootstrap se necessário
          // Mas se falhar (RLS), seguimos silenciosamente
          try {
            users = await db.getUsers();
          } catch (e) {
            console.warn("Could not fetch user list during init (expected if RLS is on).");
          }
        } else {
          users = await db.getUsers();
        }
        
        // Bootstrap: Se não houver usuários e for o primeiro acesso, tenta salvar o admin
        if (users.length === 0) {
          try {
            await db.saveUser(DEFAULT_ADMIN);
            users = [DEFAULT_ADMIN];
          } catch (saveError) {
            console.warn("Bootstrap admin save failed. Manual SQL and RLS setup might be required.", saveError);
          }
        }

        // Recupera o ID do usuário logado do localStorage
        const loggedInUserId = localStorage.getItem('consortium_logged_in_user');
        
        if (loggedInUserId) {
          let foundUser = users.find(u => u.id === loggedInUserId && u.isActive);
          
          // Se não encontrou na lista (que pode estar vazia pelo RLS), tenta buscar pelo ID diretamente
          if (!foundUser && isCloud) {
            try {
              foundUser = await db.getUserById(loggedInUserId);
              if (foundUser && !foundUser.isActive) foundUser = null;
            } catch (e) {
              console.error("Failed to fetch logged in user by ID", e);
            }
          }

          if (foundUser) {
            setUser(foundUser);
          } else {
            localStorage.removeItem('consortium_logged_in_user');
          }
        }
      } catch (error) {
        console.error("Critical failure during auth initialization", error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password?.trim() || '';
    
    // Busca o usuário especificamente pelo e-mail (mais seguro e eficiente com RLS)
    const foundUser = await db.getUserByEmail(cleanEmail);
    
    if (!foundUser) {
      throw new Error('Usuário não encontrado neste dispositivo ou na nuvem.');
    }

    if (!foundUser.isActive) {
      throw new Error('Este usuário está inativo. Contate o administrador.');
    }

    // Se o usuário tem senha definida, precisamos validar
    if (foundUser.password) {
      if (foundUser.password !== cleanPassword) {
        throw new Error('Senha incorreta.');
      }
    } else if (cleanPassword !== '') {
      // Se o usuário não tem senha mas tentou entrar com uma, podemos permitir ou não.
      // Por segurança, se não tem senha, só entra se a senha enviada for vazia.
      // Mas para facilitar, vamos permitir entrar se não houver senha no banco.
    }

    setUser(foundUser);
    localStorage.setItem('consortium_logged_in_user', foundUser.id);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('consortium_logged_in_user');
  };

  const hasPermission = (permission: keyof User['permissions']) => {
    if (!user) return false;
    if (user.role === UserRole.ADMIN) return true; // Admin has all permissions
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
