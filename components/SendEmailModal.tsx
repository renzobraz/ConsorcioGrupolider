import React, { useState, useEffect } from 'react';
import { X, Mail, Send, CheckCircle2, AlertCircle, Loader2, ListChecks, Filter, Calendar, Save, Clock } from 'lucide-react';
import { ReportFrequency } from '../types';

interface Column {
  id: string;
  label: string;
  selected: boolean;
}

interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (config: {
    recipient: string;
    subject: string;
    message: string;
    selectedColumns: string[];
    filters: {
      referenceDate: string;
      companyId?: string;
      administratorId?: string;
      productType?: string;
      status?: string;
    };
    saveAsScheduled: boolean;
    frequency: ReportFrequency;
    reportName: string;
  }) => Promise<void>;
  defaultRecipient: string;
  defaultSubject: string;
  defaultMessage?: string;
  defaultSelectedColumns?: string[];
  defaultFrequency?: ReportFrequency;
  defaultReportName?: string;
  defaultSaveAsScheduled?: boolean;
  availableColumns: { id: string; label: string }[];
  currentFilters: {
    referenceDate: string;
    companyId?: string;
    administratorId?: string;
    productType?: string;
    status?: string;
  };
  companies: { id: string; name: string }[];
  administrators: { id: string; name: string }[];
}

export const SendEmailModal: React.FC<SendEmailModalProps> = ({
  isOpen,
  onClose,
  onSend,
  defaultRecipient,
  defaultSubject,
  defaultMessage = 'Olá,\n\nSegue em anexo o relatório solicitado.\n\nAtenciosamente,\nSistema de Consórcios',
  defaultSelectedColumns,
  defaultFrequency = ReportFrequency.NONE,
  defaultReportName = '',
  defaultSaveAsScheduled = false,
  availableColumns,
  currentFilters,
  companies,
  administrators
}) => {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [columns, setColumns] = useState<Column[]>([]);
  const [filters, setFilters] = useState(currentFilters);
  const [saveAsScheduled, setSaveAsScheduled] = useState(defaultSaveAsScheduled);
  const [frequency, setFrequency] = useState<ReportFrequency>(defaultFrequency);
  const [reportName, setReportName] = useState(defaultReportName);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRecipient(defaultRecipient);
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setFilters(currentFilters);
      
      if (defaultSelectedColumns && defaultSelectedColumns.length > 0) {
        setColumns(availableColumns.map(col => ({ 
          ...col, 
          selected: defaultSelectedColumns.includes(col.id) 
        })));
      } else {
        setColumns(availableColumns.map(col => ({ ...col, selected: true })));
      }
      
      setSaveAsScheduled(defaultSaveAsScheduled);
      setFrequency(defaultFrequency);
      setReportName(defaultReportName);
      setError(null);
    }
  }, [isOpen, defaultRecipient, defaultSubject, defaultMessage, defaultSelectedColumns, defaultFrequency, defaultReportName, defaultSaveAsScheduled, availableColumns, currentFilters]);

  if (!isOpen) return null;

  const handleToggleColumn = (id: string) => {
    setColumns(prev => prev.map(col => 
      col.id === id ? { ...col, selected: !col.selected } : col
    ));
  };

  const handleSelectAll = (selected: boolean) => {
    setColumns(prev => prev.map(col => ({ ...col, selected })));
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value || undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient) {
      setError('Por favor, informe o e-mail do destinatário.');
      return;
    }

    if (saveAsScheduled && !reportName) {
      setError('Por favor, informe um nome para o relatório agendado.');
      return;
    }

    const selectedColIds = columns.filter(c => c.selected).map(c => c.id);
    if (selectedColIds.length === 0) {
      setError('Selecione pelo menos uma coluna para o relatório.');
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      await onSend({
        recipient,
        subject,
        message: message.replace(/\n/g, '<br/>'),
        selectedColumns: selectedColIds,
        filters,
        saveAsScheduled,
        frequency,
        reportName
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Mail size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Enviar Relatório Personalizado</h3>
              <p className="text-xs text-slate-500">Configure filtros, colunas e agendamento</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Email & Scheduling */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Mail size={14} /> Dados do Envio
                  </h4>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Destinatário(s)</label>
                    <input
                      type="text"
                      value={recipient}
                      onChange={e => setRecipient(e.target.value)}
                      placeholder="email@exemplo.com, outro@exemplo.com"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                      required
                    />
                    <p className="text-[10px] text-slate-400 italic">Para múltiplos destinatários, separe os e-mails por vírgula.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Assunto</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Mensagem</label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none resize-none text-sm"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="saveAsScheduled"
                      checked={saveAsScheduled}
                      onChange={e => setSaveAsScheduled(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="saveAsScheduled" className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-2">
                      <Save size={14} /> Salvar e Agendar Relatório
                    </label>
                  </div>

                  {saveAsScheduled && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Nome do Agendamento</label>
                        <input
                          type="text"
                          value={reportName}
                          onChange={e => setReportName(e.target.value)}
                          placeholder="Ex: Relatório Semanal Diretoria"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                          required={saveAsScheduled}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Frequência de Envio</label>
                        <select
                          value={frequency}
                          onChange={e => setFrequency(e.target.value as ReportFrequency)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value={ReportFrequency.NONE}>Apenas Salvar (Sem envio automático)</option>
                          <option value={ReportFrequency.DAILY}>Diário</option>
                          <option value={ReportFrequency.WEEKLY}>Semanal</option>
                          <option value={ReportFrequency.MONTHLY}>Mensal</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Middle Column: Filters */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Filter size={14} /> Filtros do Relatório
                </h4>
                
                <div className="grid grid-cols-1 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data de Referência</label>
                    <div className="relative">
                      <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="date"
                        name="referenceDate"
                        value={filters.referenceDate}
                        onChange={handleFilterChange}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Empresa</label>
                    <select
                      name="companyId"
                      value={filters.companyId || ''}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Todas as Empresas</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Administradora</label>
                    <select
                      name="administratorId"
                      value={filters.administratorId || ''}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Todas as Administradoras</option>
                      {administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Produto</label>
                    <select
                      name="productType"
                      value={filters.productType || ''}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Todos os Produtos</option>
                      <option value="VEICULO">Veículo</option>
                      <option value="IMOVEL">Imóvel</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Status</label>
                    <select
                      name="status"
                      value={filters.status || ''}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Todos os Status</option>
                      <option value="CONTEMPLATED">Contempladas</option>
                      <option value="ACTIVE">Em Andamento</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Right Column: Column Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <ListChecks size={14} /> Colunas do Relatório (PDF)
                  </h4>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => handleSelectAll(true)}
                      className="text-[10px] text-blue-600 hover:underline font-bold"
                    >
                      Todas
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleSelectAll(false)}
                      className="text-[10px] text-slate-400 hover:underline font-bold"
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-[400px] overflow-y-auto">
                  {columns.map(col => (
                    <label key={col.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={col.selected}
                        onChange={() => handleToggleColumn(col.id)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span className={`text-xs font-medium transition-colors ${col.selected ? 'text-slate-800' : 'text-slate-400'}`}>
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex-[2] px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              {isSending ? 'Processando...' : saveAsScheduled ? 'Salvar e Enviar Agora' : 'Enviar Agora'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
