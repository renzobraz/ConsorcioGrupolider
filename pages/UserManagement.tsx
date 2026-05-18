import React, { useState, useEffect } from 'react';
import { User, UserRole, UserPermissions } from '../types';
import { Shield, UserPlus, Save, Trash2, Edit2, X, Check, Building2, Key, Mail } from 'lucide-react';
import { db } from '../services/database';
import { useConsortium } from '../store/ConsortiumContext';
import { getSupabase } from '../services/supabaseClient';

const defaultPermissions: UserPermissions = {
  dashboard: true,
  marketplace: false,
  minhas_cotas: false,
  simulador_extrato: true,
  gestao_creditos: false,
  calculadora_avulsa: true,
  relatorios_inadimplencia: false,
  relatorios_assembleia: false,
  relatorios_contemplados: false,
  relatorios_agendados: false,
  cadastro_administradoras: false,
  cadastro_empresas: false,
  cadastro_indices: false,
  usuarios: false,
  allowedCompanyIds: [],
};

const USER_PROFILES = {
  ADMIN: {
    label: 'Administrador',
    permissions: {
      dashboard: true, marketplace: true, minhas_cotas: true, simulador_extrato: true, gestao_creditos: true,
      calculadora_avulsa: true, relatorios_inadimplencia: true, relatorios_assembleia: true, relatorios_contemplados: true,
      relatorios_agendados: true, cadastro_administradoras: true, cadastro_empresas: true, cadastro_indices: true, usuarios: true
    }
  },
  GERENTE: {
    label: 'Gerente',
    permissions: {
      dashboard: true, marketplace: true, minhas_cotas: true, simulador_extrato: true, gestao_creditos: true,
      calculadora_avulsa: true, relatorios_inadimplencia: true, relatorios_assembleia: true, relatorios_contemplados: true,
      relatorios_agendados: true, cadastro_administradoras: false, cadastro_empresas: false, cadastro_indices: false, usuarios: false
    }
  },
  VENDEDOR: {
    label: 'Vendedor',
    permissions: {
      dashboard: true, marketplace: false, minhas_cotas: true, simulador_extrato: true, gestao_creditos: false,
      calculadora_avulsa: true, relatorios_inadimplencia: false, relatorios_assembleia: false, relatorios_contemplados: false,
      relatorios_agendados: false, cadastro_administradoras: false, cadastro_empresas: false, cadastro_indices: false, usuarios: false
    }
  },
  CONSULTOR: {
    label: 'Consultor',
    permissions: {
      dashboard: true, marketplace: false, minhas_cotas: false, simulador_extrato: true, gestao_creditos: false,
      calculadora_avulsa: false, relatorios_inadimplencia: true, relatorios_assembleia: true, relatorios_contemplados: true,
      relatorios_agendados: true, cadastro_administradoras: false, cadastro_empresas: false, cadastro_indices: false, usuarios: false
    }
  },
  CUSTOM: {
    label: 'Personalizado',
    permissions: {}
  }
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

        // 2. Criar perfil na tabela pública (apenas campos existentes)
        const newUserProfile: User = {
          id: authData.user.id,
          email: editForm.email.trim().toLowerCase(),
          name: editForm.name!,
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
        // Atualização de usuário existente (apenas perfil, sem password ou company_id)
        const { error: dbError } = await supabase
          .from('users')
          .update({
            name: editForm.name,
            role: editForm.role,
            is_active: editForm.isActive,
            permissions: editForm.permissions
          })
          .eq('id', isEditing);

        if (dbError) throw dbError;

        const updatedUser = { 
          ...users.find(u => u.id === isEditing), 
          ...editForm 
        } as User;
        
        const updatedUsers = users.map(u => u.id === isEditing ? updatedUser : u);
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
        redirectTo: window.location.origin,
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
    if (perm === 'allowedCompanyIds') return;
    
    setEditForm(prev => {
      const newPermissions = {
        ...prev.permissions!,
        [perm]: !prev.permissions![perm]
      };
      
      return {
        ...prev,
        permissions: newPermissions
      };
    });
  };

  const applyProfile = (profileKey: keyof typeof USER_PROFILES) => {
    if (profileKey === 'CUSTOM') return;
    
    setEditForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions!,
        ...USER_PROFILES[profileKey].permissions
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
                <>
                  <tr className="bg-emerald-50/50 border-b border-emerald-200">
                    <td className="px-4 py-3">
                      <input 
                        type="text" 
                        value={editForm.name || ''} 
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        className="w-full border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                        placeholder="Nome completo"
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
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                        Novo
                      </span>
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

                  {/* Permissions Editor Row para Novo Usuário */}
                  {editForm.role === UserRole.USER && (
                    <tr className="bg-emerald-50/20 border-b border-emerald-100">
                      <td colSpan={6} className="px-4 py-6">
                        <div className="flex flex-col gap-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-200 pb-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                              <Shield size={16} className="text-emerald-600" />
                              Definir Permissões Iniciais
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Perfil Rápido:</span>
                              <select 
                                onChange={(e) => applyProfile(e.target.value as any)}
                                className="text-xs border border-emerald-300 rounded px-2 py-1 outline-none focus:border-emerald-500 bg-white"
                              >
                                <option value="">Selecione um perfil...</option>
                                {Object.entries(USER_PROFILES).filter(([k]) => k !== 'CUSTOM').map(([key, p]) => (
                                  <option key={key} value={key}>{p.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                            {/* Categoria: Geral */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Navegação Geral</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'dashboard', label: 'Dashboard' },
                                  { id: 'marketplace', label: 'Marketplace' },
                                  { id: 'minhas_cotas', label: 'Minhas Cotas' },
                                  { id: 'gestao_creditos', label: 'Gestão de Créditos' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Categoria: Relatórios */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Relatórios</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'relatorios_inadimplencia', label: 'Inadimplência' },
                                  { id: 'relatorios_assembleia', label: 'Assembleia' },
                                  { id: 'relatorios_contemplados', label: 'Contemplados' },
                                  { id: 'relatorios_agendados', label: 'Agendados' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Categoria: Ferramentas */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ferramentas</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'simulador_extrato', label: 'Simulador Extrato' },
                                  { id: 'calculadora_avulsa', label: 'Calculadora Avulsa' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Categoria: Cadastros */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configurações</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'cadastro_administradoras', label: 'Administradoras' },
                                  { id: 'cadastro_empresas', label: 'Empresas' },
                                  { id: 'cadastro_indices', label: 'Índices' },
                                  { id: 'usuarios', label: 'Gestão Usuários' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          {companies.length > 0 && (
                            <div className="pt-4 mt-2 border-t border-emerald-200">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                                <Building2 size={16} className="text-emerald-600" />
                                Restrição de Acesso por Empresa
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                {companies.map(company => (
                                  <label key={company.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all group">
                                    <input 
                                      type="checkbox" 
                                      checked={(editForm.permissions?.allowedCompanyIds || []).includes(company.id)} 
                                      onChange={() => {
                                        const current = editForm.permissions?.allowedCompanyIds || [];
                                        const next = current.includes(company.id)
                                          ? current.filter(id => id !== company.id)
                                          : [...current, company.id];
                                        setEditForm({
                                          ...editForm,
                                          permissions: { ...editForm.permissions!, allowedCompanyIds: next }
                                        });
                                      }} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-xs text-slate-600 group-hover:text-slate-900 truncate" title={company.name}>{company.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
                      <td colSpan={6} className="px-4 py-6">
                        <div className="flex flex-col gap-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                              <Shield size={16} className="text-emerald-600" />
                              Permissões de Acesso {isEditing === 'new' ? '(Novo Usuário)' : ''}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Perfil Rápido:</span>
                              <select 
                                onChange={(e) => applyProfile(e.target.value as any)}
                                className="text-xs border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500 bg-white"
                              >
                                <option value="">Selecione um perfil...</option>
                                {Object.entries(USER_PROFILES).filter(([k]) => k !== 'CUSTOM').map(([key, p]) => (
                                  <option key={key} value={key}>{p.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                            {/* Categoria: Geral */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Navegação Geral</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'dashboard', label: 'Dashboard' },
                                  { id: 'marketplace', label: 'Marketplace' },
                                  { id: 'minhas_cotas', label: 'Minhas Cotas' },
                                  { id: 'gestao_creditos', label: 'Gestão de Créditos' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Categoria: Relatórios */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Relatórios</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'relatorios_inadimplencia', label: 'Inadimplência' },
                                  { id: 'relatorios_assembleia', label: 'Assembleia' },
                                  { id: 'relatorios_contemplados', label: 'Contemplados' },
                                  { id: 'relatorios_agendados', label: 'Agendados' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Categoria: Ferramentas */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ferramentas</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'simulador_extrato', label: 'Simulador Extrato' },
                                  { id: 'calculadora_avulsa', label: 'Calculadora Avulsa' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Categoria: Cadastros */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configurações</h4>
                              <div className="space-y-2">
                                {[
                                  { id: 'cadastro_administradoras', label: 'Administradoras' },
                                  { id: 'cadastro_empresas', label: 'Empresas' },
                                  { id: 'cadastro_indices', label: 'Índices' },
                                  { id: 'usuarios', label: 'Gestão Usuários' },
                                ].map(p => (
                                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox" 
                                      checked={!!(editForm.permissions as any)?.[p.id]} 
                                      onChange={() => togglePermission(p.id as any)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          {companies.length > 0 && (
                            <div className="pt-4 mt-2 border-t border-slate-200">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                                <Building2 size={16} className="text-emerald-600" />
                                Restrição de Acesso por Empresa
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                {companies.map(company => (
                                  <label key={company.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all group">
                                    <input 
                                      type="checkbox" 
                                      checked={(editForm.permissions?.allowedCompanyIds || []).includes(company.id)} 
                                      onChange={() => toggleCompanyPermission(company.id)} 
                                      className="rounded text-emerald-600 focus:ring-emerald-500" 
                                    />
                                    <span className="text-xs text-slate-600 group-hover:text-slate-900 truncate" title={company.name}>{company.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
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
