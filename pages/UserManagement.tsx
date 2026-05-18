import React, { useState, useEffect } from 'react';
import { User, UserRole, UserPermissions } from '../types';
import { Shield, UserPlus, Save, Trash2, Edit2, X, Check, Building2 } from 'lucide-react';
import { db } from '../services/database';
import { useConsortium } from '../store/ConsortiumContext';
import { getSupabase } from '../services/supabaseClient';

const defaultPermissions: UserPermissions = {
  canViewDashboard: true,
  canManageQuotas: false,
  canSimulate: true,
  canViewReports: false,
  canManageSettings: false,
  canMarkQuotas: false,
  allowedCompanyIds: [],
};

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { companies } = useConsortium();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await db.getUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = () => {
    const newId = `new-${Date.now()}`;
    const newUser: User = {
      id: newId,
      email: '',
      name: '',
      password: '',
      role: UserRole.USER,
      isActive: true,
      permissions: { ...defaultPermissions }
    };
    setIsEditing(newId);
    setEditForm(newUser);
    setUsers([...users, newUser]);
  };

  const handleSave = async () => {
    if (!editForm.email || !editForm.name) {
      alert('Nome e E-mail são obrigatórios.');
      return;
    }

    const isNewUser = isEditing?.startsWith('new-');
    const supabase = getSupabase();
    
    try {
      let finalId = isEditing!;

      if (isNewUser) {
        if (!editForm.password || editForm.password.length < 6) {
          alert('A senha é obrigatória e deve ter pelo menos 6 caracteres para novos usuários.');
          return;
        }

        // 1. Criar no Supabase Auth
        const { data: authData, error: authError } = await supabase!.auth.signUp({
          email: editForm.email,
          password: editForm.password,
          options: {
            data: {
              name: editForm.name
            }
          }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('Falha ao criar credenciais de acesso.');

        finalId = authData.user.id;
      }

      // 2. Salvar na tabela 'users' (perfil)
      const userToSave: User = {
        id: finalId,
        email: editForm.email,
        name: editForm.name!,
        role: editForm.role as UserRole,
        isActive: editForm.isActive !== undefined ? editForm.isActive : true,
        permissions: (editForm.permissions || { ...defaultPermissions }) as UserPermissions,
      };

      await db.saveUser(userToSave);
      
      // Atualiza a lista local
      if (isNewUser) {
        setUsers(prev => [...prev.filter(u => u.id !== isEditing), userToSave]);
      } else {
        setUsers(prev => prev.map(u => u.id === isEditing ? userToSave : u));
      }
      
      setIsEditing(null);
      setEditForm({});
      alert(isNewUser ? "Usuário criado com sucesso!" : "Usuário atualizado com sucesso!");
    } catch (error: any) {
      console.error("Failed to save user", error);
      alert(`Erro ao salvar usuário: ${error.message}`);
    }
  };

  const handleResetPassword = async (email: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      alert(`Um link de redefinição de senha foi enviado para: ${email}`);
    } catch (error: any) {
      alert(`Erro ao solicitar redefinição: ${error.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('new-')) {
      setUsers(users.filter(u => u.id !== id));
      setIsEditing(null);
      return;
    }

    if (confirm('Tem certeza que deseja desativar este usuário?')) {
      try {
        const user = users.find(u => u.id === id);
        if (user) {
          const updatedUser = { ...user, isActive: false };
          await db.saveUser(updatedUser);
          setUsers(users.map(u => u.id === id ? updatedUser : u));
        }
      } catch (error) {
        console.error("Failed to deactivate user", error);
        alert("Erro ao desativar usuário.");
      }
    }
  };

  const togglePermission = (perm: keyof UserPermissions) => {
    setEditForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions!,
        [perm]: !prev.permissions![perm]
      }
    }));
  };

  const toggleCompanyPermission = (companyId: string) => {
    setEditForm(prev => {
      const currentAllowed = prev.permissions?.allowedCompanyIds || [];
      const newAllowed = currentAllowed.includes(companyId)
        ? currentAllowed.filter(id => id !== companyId)
        : [...currentAllowed, companyId];
        
      return {
        ...prev,
        permissions: {
          ...prev.permissions!,
          allowedCompanyIds: newAllowed
        }
      };
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Carregando usuários...</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestão de Usuários</h1>
          <p className="text-slate-500">Controle de acesso e permissões do sistema</p>
        </div>
        <button 
          onClick={handleAddUser}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium"
        >
          <UserPlus size={20} /> Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">{isEditing?.startsWith('new-') ? 'Senha' : 'Acesso'}</th>
                <th className="px-4 py-3 font-medium">Nível</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <React.Fragment key={user.id}>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      {isEditing === user.id ? (
                        <input 
                          type="text" 
                          value={editForm.name || ''} 
                          onChange={e => setEditForm({...editForm, name: e.target.value})}
                          className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                          placeholder="Nome do usuário"
                        />
                      ) : (
                        <span className="font-medium text-slate-800">{user.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing === user.id ? (
                        <input 
                          type="email" 
                          value={editForm.email || ''} 
                          onChange={e => setEditForm({...editForm, email: e.target.value})}
                          className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                          placeholder="E-mail"
                        />
                      ) : (
                        <span className="text-slate-600">{user.email}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing === user.id ? (
                        isEditing.startsWith('new-') ? (
                          <input 
                            type="password" 
                            value={editForm.password || ''} 
                            onChange={e => setEditForm({...editForm, password: e.target.value})}
                            className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500 text-xs"
                            placeholder="Mín. 6 caracteres"
                          />
                        ) : (
                          <button 
                            onClick={() => handleResetPassword(user.email)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-2 py-1 rounded border border-blue-200"
                          >
                            Resetar Senha
                          </button>
                        )
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">••••••••</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing === user.id ? (
                        <select 
                          value={editForm.role || UserRole.USER}
                          onChange={e => setEditForm({...editForm, role: e.target.value as UserRole})}
                          className="border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                        >
                          <option value={UserRole.USER}>Usuário</option>
                          <option value={UserRole.ADMIN}>Administrador</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {user.role === UserRole.ADMIN ? 'Admin' : 'Usuário'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing === user.id ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={editForm.isActive}
                            onChange={e => setEditForm({...editForm, isActive: e.target.checked})}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm">Ativo</span>
                        </label>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {user.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Salvar">
                            <Check size={18} />
                          </button>
                          <button onClick={() => setIsEditing(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="Cancelar">
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setIsEditing(user.id); setEditForm(user); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete(user.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir" disabled={user.role === UserRole.ADMIN && users.filter(u => u.role === UserRole.ADMIN).length === 1}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  
                  {/* Permissions Editor Row */}
                  {isEditing === user.id && editForm.role === UserRole.USER && (
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Shield size={16} className="text-emerald-600" />
                            Permissões de Acesso
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                              <input type="checkbox" checked={editForm.permissions?.canViewDashboard} onChange={() => togglePermission('canViewDashboard')} className="rounded text-emerald-600 focus:ring-emerald-500" />
                              <span className="text-sm text-slate-700">Ver Dashboard</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                              <input type="checkbox" checked={editForm.permissions?.canManageQuotas} onChange={() => togglePermission('canManageQuotas')} className="rounded text-emerald-600 focus:ring-emerald-500" />
                              <span className="text-sm text-slate-700">Gerenciar Cotas</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                              <input type="checkbox" checked={editForm.permissions?.canSimulate} onChange={() => togglePermission('canSimulate')} className="rounded text-emerald-600 focus:ring-emerald-500" />
                              <span className="text-sm text-slate-700">Usar Simulador</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                              <input type="checkbox" checked={editForm.permissions?.canViewReports} onChange={() => togglePermission('canViewReports')} className="rounded text-emerald-600 focus:ring-emerald-500" />
                              <span className="text-sm text-slate-700">Ver Relatórios</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                              <input type="checkbox" checked={editForm.permissions?.canManageSettings} onChange={() => togglePermission('canManageSettings')} className="rounded text-emerald-600 focus:ring-emerald-500" />
                              <span className="text-sm text-slate-700">Configurações (Admin/Empresas)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                              <input type="checkbox" checked={editForm.permissions?.canMarkQuotas} onChange={() => togglePermission('canMarkQuotas')} className="rounded text-emerald-600 focus:ring-emerald-500" />
                              <span className="text-sm text-slate-700">Marcar Minhas Cotas</span>
                            </label>
                          </div>
                          
                          {companies.length > 0 && (
                            <>
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mt-4 border-t pt-4 border-slate-200">
                                <Building2 size={16} className="text-emerald-600" />
                                Acesso por Empresa
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {companies.map(company => (
                                  <label key={company.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                                    <input 
                                      type="checkbox" 
                                      checked={(editForm.permissions?.allowedCompanyIds || []).includes(company.id)} 
                                      onChange={() => toggleCompanyPermission(company.id)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-700 truncate" title={company.name}>{company.name}</span>
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
