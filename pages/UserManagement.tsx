import React, { useState, useEffect } from 'react';
import { User, UserRole, UserPermissions } from '../types';
import { Shield, UserPlus, Save, Trash2, Edit2, X, Check, Building2, Key, Mail } from 'lucide-react';
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
    const newUser: Partial<User> & { password?: string } = {
      id: '', // Será gerado pelo Supabase Auth
      email: '',
      name: '',
      role: UserRole.USER,
      isActive: true,
      password: '',
      permissions: { ...defaultPermissions }
    };
    setIsEditing('new');
    setEditForm(newUser);
  };

  const handleSave = async () => {
    if (!editForm.email || !editForm.name) {
      alert('Nome e E-mail são obrigatórios.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    setIsLoading(true);
    try {
      if (isEditing === 'new') {
        // 1. Criar novo usuário no Supabase Auth
        if (!editForm.password || editForm.password.length < 6) {
          alert('A senha deve ter no mínimo 6 caracteres.');
          setIsLoading(false);
          return;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: editForm.email.trim().toLowerCase(),
          password: editForm.password,
          options: {
            data: {
              name: editForm.name
            }
          }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('Falha ao criar usuário no Auth.');

        // 2. Criar perfil na tabela pública
        const newUserProfile: User = {
          id: authData.user.id,
          email: editForm.email.trim().toLowerCase(),
          name: editForm.name,
          role: editForm.role as UserRole,
          isActive: true,
          permissions: editForm.permissions || { ...defaultPermissions }
        };

        const { error: dbError } = await supabase
          .from('users')
          .insert({
            id: newUserProfile.id,
            email: newUserProfile.email,
            name: newUserProfile.name,
            role: newUserProfile.role,
            is_active: newUserProfile.isActive,
            permissions: newUserProfile.permissions
          });

        if (dbError) throw dbError;
        
        setUsers([...users, newUserProfile]);
        alert('Usuário criado com sucesso! Ele já pode fazer login (e deve confirmar o e-mail se configurado).');
      } else {
        // Atualização de usuário existente (apenas perfil)
        const userToSave = { ...users.find(u => u.id === isEditing), ...editForm } as User;
        
        const { error: dbError } = await supabase
          .from('users')
          .update({
            name: userToSave.name,
            role: userToSave.role,
            is_active: userToSave.isActive,
            permissions: userToSave.permissions
          })
          .eq('id', isEditing);

        if (dbError) throw dbError;

        const updatedUsers = users.map(u => u.id === isEditing ? userToSave : u);
        setUsers(updatedUsers);
      }
      setIsEditing(null);
    } catch (error: any) {
      console.error("Failed to save user", error);
      alert("Erro ao salvar usuário: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Enviar link de redefinição de senha para ${email}?`)) return;
    
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login',
      });
      if (error) throw error;
      alert('E-mail de redefinição enviado com sucesso!');
    } catch (error: any) {
      alert('Erro ao enviar e-mail: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este usuário?')) {
      try {
        await db.deleteUser(id);
        setUsers(users.filter(u => u.id !== id));
      } catch (error) {
        console.error("Failed to delete user", error);
        alert("Erro ao excluir usuário.");
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
                <th className="px-4 py-3 font-medium">Nível</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Opção para novo usuário no topo da lista se estiver criando */}
              {isEditing === 'new' && (
                <tr className="bg-emerald-50/30">
                  <td className="px-4 py-3">
                    <input 
                      type="text" 
                      value={editForm.name || ''} 
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                      placeholder="Nome do usuário"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input 
                      type="email" 
                      value={editForm.email || ''} 
                      onChange={e => setEditForm({...editForm, email: e.target.value})}
                      className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                      placeholder="E-mail"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select 
                      value={editForm.role || UserRole.USER}
                      onChange={e => setEditForm({...editForm, role: e.target.value as UserRole})}
                      className="border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                    >
                      <option value={UserRole.USER}>Usuário</option>
                      <option value={UserRole.ADMIN}>Administrador</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                       <input 
                        type="password" 
                        value={editForm.password || ''} 
                        onChange={e => setEditForm({...editForm, password: e.target.value})}
                        className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                        placeholder="Senha (min 6 carac.)"
                        minLength={6}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Salvar">
                        <Check size={18} />
                      </button>
                      <button onClick={() => setIsEditing(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="Cancelar">
                        <X size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

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
                      <span className="text-slate-600">{user.email}</span>
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
                          <button 
                            onClick={() => handleResetPassword(user.email)} 
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" 
                            title="Resetar Senha"
                          >
                            <Mail size={18} />
                          </button>
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
                  {(isEditing === user.id || (isEditing === 'new' && user.id === '')) && (editForm.role === UserRole.USER) && (
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Shield size={16} className="text-emerald-600" />
                            Permissões de Acesso {isEditing === 'new' ? '(Novo Usuário)' : ''}
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
