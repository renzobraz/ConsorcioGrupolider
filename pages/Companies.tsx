
import React, { useState } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { Company } from '../types';
import { Trash2, Plus, Briefcase, Phone, Mail } from 'lucide-react';

const Companies = () => {
  const { companies, addCompany, deleteCompany } = useConsortium();
  
  const [form, setForm] = useState<Partial<Company>>({
    name: '',
    phone: '',
    email: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!form.name) return;

    const comp: Company = {
      id: crypto.randomUUID(),
      name: form.name,
      phone: form.phone || '',
      email: form.email || ''
    };
    
    addCompany(comp);
    setForm({ name: '', phone: '', email: '' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Empresas Compradoras</h1>
        <p className="text-slate-500">Cadastre as empresas que compram os consórcios.</p>
      </div>

      {/* Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
           <Plus size={20} className="text-emerald-600"/> Nova Empresa
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Nome da Empresa *</label>
            <input 
              type="text" 
              required
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              placeholder="Ex: Investimentos SA"
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Telefone</label>
            <input 
              type="text" 
              value={form.phone}
              onChange={e => setForm({...form, phone: e.target.value})}
              placeholder="(11) 9999-9999"
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="md:col-span-1">
             <label className="block text-sm font-medium text-slate-600 mb-1">E-mail</label>
            <input 
              type="email" 
              value={form.email}
              onChange={e => setForm({...form, email: e.target.value})}
              placeholder="comercial@empresa.com"
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          
          <button type="submit" className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors h-[46px]">
            Adicionar
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                <tr>
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">Telefone</th>
                    <th className="px-6 py-3">E-mail</th>
                    <th className="px-6 py-3 text-right">Ação</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {companies.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nenhuma empresa cadastrada</td></tr>
                ) : (
                    companies.map(comp => (
                    <tr key={comp.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-2">
                            <Briefcase size={16} className="text-slate-400"/> {comp.name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                            {comp.phone ? <span className="flex items-center gap-1"><Phone size={14}/> {comp.phone}</span> : '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                             {comp.email ? <span className="flex items-center gap-1"><Mail size={14}/> {comp.email}</span> : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <button onClick={() => deleteCompany(comp.id)} className="text-red-400 hover:text-red-600 transition-colors">
                                <Trash2 size={18} />
                            </button>
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
