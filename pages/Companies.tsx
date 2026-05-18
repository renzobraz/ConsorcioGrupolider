
import React, { useState } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { Company } from '../types';
import { Trash2, Plus, Briefcase, Phone, Mail, User, Building2, Pencil, X, Check } from 'lucide-react';

const Companies: React.FC = () => {
  const { companies, addCompany, deleteCompany, updateCompany } = useConsortium();
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [form, setForm] = useState<Partial<Company>>({
    name: '',
    phone: '',
    email: '',
    document: '',
    document_type: 'CNPJ'
  });

  const maskCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };

  const maskCNPJ = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2')
      .slice(0, 18);
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const masked = form.document_type === 'CPF' ? maskCPF(value) : maskCNPJ(value);
    setForm({ ...form, document: masked });
  };

  const handleEdit = (comp: Company) => {
    setEditingId(comp.id);
    setForm({
      name: comp.name || '',
      phone: comp.phone || '',
      email: comp.email || '',
      document: comp.document || '',
      document_type: comp.document_type || 'CNPJ'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ name: '', phone: '', email: '', document: '', document_type: 'CNPJ' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!form.name) return;

    if (editingId) {
      const updated: Company = {
        id: editingId,
        name: form.name,
        phone: form.phone || '',
        email: form.email || '',
        document: form.document || '',
        document_type: (form.document_type as 'CPF' | 'CNPJ') || 'CNPJ'
      };
      updateCompany?.(updated);
      setEditingId(null);
    } else {
      const comp: Company = {
        id: crypto.randomUUID(),
        name: form.name,
        phone: form.phone || '',
        email: form.email || '',
        document: form.document || '',
        document_type: (form.document_type as 'CPF' | 'CNPJ') || 'CNPJ'
      };
      addCompany(comp);
    }
    
    setForm({ 
      name: '', 
      phone: '', 
      email: '', 
      document: '', 
      document_type: 'CNPJ' 
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pt-4">
      {/* Form */}
      <div className={`p-6 rounded-xl shadow-sm border transition-all ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
        <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
           {editingId ? (
             <><Pencil size={20} className="text-amber-600"/> Editando Titular</>
           ) : (
             <><Plus size={20} className="text-emerald-600"/> Cadastrar Novo Titular (PF/PJ)</>
           )}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Nome/Razão */}
            <div className="md:col-span-5">
              <label className="block text-sm font-medium text-slate-600 mb-1">Nome ou Razão Social *</label>
              <input 
                type="text" 
                required
                value={form.name || ''}
                onChange={e => setForm({...form, name: e.target.value})}
                placeholder="Ex: Renzo do Amaral ou Investimentos SA"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Tipo */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1">Tipo</label>
              <select 
                value={form.document_type || 'CNPJ'}
                onChange={e => setForm({...form, document_type: e.target.value as 'CPF' | 'CNPJ', document: ''})}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="CNPJ">Pessoa Jurídica (PJ)</option>
                <option value="CPF">Pessoa Física (PF)</option>
              </select>
            </div>

            {/* Documento */}
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-600 mb-1">
                {form.document_type === 'CPF' ? 'CPF' : 'CNPJ'}
              </label>
              <input 
                type="text" 
                value={form.document || ''}
                onChange={handleDocumentChange}
                placeholder={form.document_type === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
              />
            </div>

            {/* Botões Desktop */}
            <div className="hidden md:flex md:col-span-2 items-end gap-2">
              {editingId && (
                <button 
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 bg-slate-200 text-slate-600 px-3 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition-colors h-[46px]"
                  title="Cancelar edição"
                >
                  <X size={20} className="mx-auto" />
                </button>
              )}
              <button 
                type="submit" 
                className={`flex-[2] text-white px-4 py-2.5 rounded-lg font-medium transition-colors h-[46px] flex items-center justify-center gap-2 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {editingId ? <Check size={18} /> : null}
                {editingId ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Telefone</label>
              <input 
                type="text" 
                value={form.phone || ''}
                onChange={e => setForm({...form, phone: e.target.value})}
                placeholder="(11) 99999-9999"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
               <label className="block text-sm font-medium text-slate-600 mb-1">E-mail</label>
              <input 
                type="email" 
                value={form.email || ''}
                onChange={e => setForm({...form, email: e.target.value})}
                placeholder="exemplo@email.com"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Botões Mobile */}
          <div className="md:hidden pt-2 flex gap-2">
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancel}
                className="flex-1 bg-slate-200 text-slate-600 py-2.5 rounded-lg font-medium"
              >
                Cancelar
              </button>
            )}
            <button 
              type="submit" 
              className={`flex-[2] text-white py-2.5 rounded-lg font-medium ${editingId ? 'bg-amber-600' : 'bg-emerald-600'}`}
            >
              {editingId ? 'Salvar Alterações' : 'Adicionar Titular'}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                <tr>
                    <th className="px-6 py-3">Nome / Titular</th>
                    <th className="px-6 py-3">Documento</th>
                    <th className="px-6 py-3">Contato</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {companies.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nenhum titular cadastrado</td></tr>
                ) : (
                    companies.map(comp => (
                    <tr key={comp.id} className={`hover:bg-slate-50 transition-colors ${editingId === comp.id ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-6 py-4 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              {comp.document_type === 'CPF' ? (
                                <User size={16} className="text-blue-500" />
                              ) : comp.document_type === 'CNPJ' ? (
                                <Building2 size={16} className="text-emerald-500" />
                              ) : (
                                <Briefcase size={16} className="text-slate-400" />
                              )}
                              <span>{comp.name}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-mono text-[13px]">
                            {comp.document ? (
                              <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">{comp.document_type}</span>
                                <span>{comp.document}</span>
                              </div>
                            ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                             <div className="space-y-1">
                                {comp.phone && <span className="flex items-center gap-1 text-xs"><Phone size={12}/> {comp.phone}</span>}
                                {comp.email && <span className="flex items-center gap-1 text-xs"><Mail size={12}/> {comp.email}</span>}
                                {!comp.phone && !comp.email && '-'}
                             </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleEdit(comp)} 
                                className="text-amber-500 hover:bg-amber-50 p-2 rounded-lg transition-colors"
                                title="Editar"
                              >
                                  <Pencil size={18} />
                              </button>
                              <button 
                                onClick={() => deleteCompany(comp.id)} 
                                className="text-red-400 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                  <Trash2 size={18} />
                              </button>
                           </div>
                        </td>
                    </tr>
                    ))
                )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default Companies;
