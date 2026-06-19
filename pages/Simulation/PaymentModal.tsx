import React from 'react';
import { X, CheckCircle } from 'lucide-react';
import { PaymentStatus } from '../../types';

interface PaymentFormData {
  status: PaymentStatus;
  paymentDate: string;
  amount: string;
  fc: string; fr: string; ta: string;
  insurance: string; amortization: string;
  fine: string; interest: string;
  manualEarnings: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  isBidModal: boolean;
  selectedInstallment: any;
  formData: PaymentFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSave: () => void;
  onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen, isBidModal, selectedInstallment, formData, onChange, onSave, onClose
}) => {
  if (!isOpen || !selectedInstallment) return null;

  const field = (name: string, label: string, value: string) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type="text" name={name} value={value} onChange={onChange}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle className="text-emerald-600" size={20} />
            {isBidModal ? 'Efetivar Lance Livre' : `Efetivar Parcela ${selectedInstallment.installmentNumber}`}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Status do Pagamento</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select name="status" value={formData.status} onChange={onChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none">
                    <option value={PaymentStatus.PREVISTO}>Previsto</option>
                    <option value={PaymentStatus.PAGO}>Pago</option>
                    <option value={PaymentStatus.CONCILIADO}>Conciliado</option>
                    <option value={PaymentStatus.EFETIVADO}>Efetivado</option>
                    <option value={PaymentStatus.QUITADO}>Quitado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Data do Pagamento</label>
                  <input type="date" name="paymentDate" value={formData.paymentDate} onChange={onChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Principais</h4>
              {field('fc', 'Fundo Comum (FC)', formData.fc)}
              {field('ta', 'Taxa de Administração (TA)', formData.ta)}
              {field('fr', 'Fundo de Reserva (FR)', formData.fr)}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Adicionais</h4>
              {field('insurance', 'Seguro', formData.insurance)}
              {field('amortization', 'Amortização', formData.amortization)}
              <div className="grid grid-cols-2 gap-4">
                {field('fine', 'Multa', formData.fine)}
                {field('interest', 'Juros', formData.interest)}
              </div>
              <div className="pt-4 mt-2 border-t border-slate-200">
                {field('manualEarnings', 'Rendimentos Manuais (Abate Saldo FC)', formData.manualEarnings)}
              </div>
              <div className="pt-4 mt-2 border-t border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1">Valor Total Pago</label>
                <input type="text" name="amount" value={formData.amount} onChange={onChange}
                  className="w-full px-3 py-2 border-2 border-emerald-200 bg-emerald-50 rounded-md text-emerald-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={onSave} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
            <CheckCircle size={16} /> Salvar Pagamento
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
