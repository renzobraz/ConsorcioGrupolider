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
  id: 'admin-1',
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
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const users = await db.getUsers();
        
        // If no users exist (e.g., first run locally), create default admin
        if (users.length === 0) {
          await db.saveUser(DEFAULT_ADMIN);
        }

        // Check if there's a logged in user
        const loggedInUserId = localStorage.getItem('consortium_logged_in_user');
        if (loggedInUserId) {
          const currentUsers = await db.getUsers();
          const foundUser = currentUsers.find(u => u.id === loggedInUserId && u.isActive);
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
    const users = await db.getUsers();
    const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.isActive);
    
    if (!foundUser) {
      throw new Error('Usuário não encontrado ou inativo.');
    }

    if (foundUser.password && foundUser.password !== password) {
      throw new Error('Senha incorreta.');
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
