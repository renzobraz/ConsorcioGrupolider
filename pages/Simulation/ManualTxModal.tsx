import React from 'react';
import { X, Plus, Edit3 } from 'lucide-react';
import { ManualTransactionType } from '../../types';

interface ManualTxFormData {
  date: string; amount: string;
  type: ManualTransactionType; description: string;
  fc: string; fr: string; ta: string;
  insurance: string; amortization: string;
  fine: string; interest: string;
}

interface ManualTxModalProps {
  isOpen: boolean;
  editingId: string | null;
  formData: ManualTxFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ManualTxModal: React.FC<ManualTxModalProps> = ({
  isOpen, editingId, formData, onChange, onSubmit, onClose
}) => {
  if (!isOpen) return null;

  const field = (name: string, label: string, value: string) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type="text" name={name} value={value} onChange={onChange}
        className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {editingId ? <Edit3 className="text-blue-600" size={20} /> : <Plus className="text-blue-600" size={20} />}
            {editingId ? 'Editar Transação Manual' : 'Nova Transação Manual'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
              <input type="date" name="date" value={formData.date} onChange={onChange}
                className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select name="type" value={formData.type} onChange={onChange}
                className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value={ManualTransactionType.EARNING}>Rendimento</option>
                <option value={ManualTransactionType.EXTRA_PAYMENT}>Aporte Extra</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
            <input type="text" name="description" placeholder="Ex: Rendimento mensal, Aporte FGTS..."
              value={formData.description} onChange={onChange}
              className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('fc', 'Fundo Comum (FC)', formData.fc)}
            {field('fr', 'Fundo Reserva (FR)', formData.fr)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('ta', 'Taxa Adm (TA)', formData.ta)}
            {field('insurance', 'Seguro', formData.insurance)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('amortization', 'Amortização', formData.amortization)}
            {field('fine', 'Multa', formData.fine)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('interest', 'Juros', formData.interest)}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 font-bold">Total Pago</label>
              <input type="text" name="amount" value={formData.amount} onChange={onChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={onSubmit} className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
            {editingId ? <Edit3 size={16} /> : <Plus size={16} />}
            {editingId ? 'Salvar Alterações' : 'Adicionar Transação'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualTxModal;
