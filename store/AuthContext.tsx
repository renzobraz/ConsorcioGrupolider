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
        try {
          users = await db.getUsers();
        } catch (fetchError) {
          console.warn("Retrying fetch users...", fetchError);
          // Wait a bit and retry once (maybe RLS is being applied)
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            users = await db.getUsers();
          } catch (e) {
            console.error("Fetch users failed after retry", e);
          }
        }
        
        // If no administrators exist, attempt to create default admin
        const hasAdmin = users.some(u => u.role === UserRole.ADMIN);
        if (!hasAdmin) {
          try {
            await db.saveUser(DEFAULT_ADMIN);
            // Refresh users list after saving default admin
            users = await db.getUsers();
          } catch (saveError) {
            console.error("Policy blocking initial user creation. Check RLS settings and run SQL script.", saveError);
          }
        }

        // Check if there's a logged in user in local storage
        const loggedInUserId = localStorage.getItem('consortium_logged_in_user');
        if (loggedInUserId) {
          const foundUser = users.find(u => u.id === loggedInUserId && u.isActive);
          if (foundUser) {
            setUser(foundUser);
          } else {
            localStorage.removeItem('consortium_logged_in_user');
          }
        }
      } catch (error) {
        console.error("Failed to initialize auth", error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password?.trim() || '';
    
    const users = await db.getUsers();
    const foundUser = users.find(u => u.email.toLowerCase() === cleanEmail && u.isActive);
    
    if (!foundUser) {
      throw new Error('Usuário não encontrado ou inativo.');
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
