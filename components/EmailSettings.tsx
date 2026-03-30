import React, { useState, useEffect } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { SMTPConfig } from '../types';
import { Mail, Server, Shield, User, Key, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const EmailSettings: React.FC = () => {
  const { smtpConfig, updateSMTPConfig, sendReportEmail } = useConsortium();
  const [config, setConfig] = useState<SMTPConfig>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromName: 'Consórcio Manager',
    fromEmail: '',
    reportRecipient: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (smtpConfig) {
      setConfig(smtpConfig);
    }
  }, [smtpConfig]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'port' ? Number(value) : value)
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await updateSMTPConfig(config);
      setMessage({ type: 'success', text: 'Configurações de e-mail salvas com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao salvar: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setIsTesting(true);
    setMessage(null);
    try {
      await sendReportEmail(
        'E-mail de Teste - Consórcio Manager',
        '<h1>Teste de Configuração</h1><p>Este é um e-mail de teste para validar as configurações de SMTP no seu sistema de Consórcio Manager.</p>'
      );
      setMessage({ type: 'success', text: 'E-mail de teste enviado com sucesso! Verifique sua caixa de entrada.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro no teste: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Mail size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Configuração de E-mail (SMTP)</h2>
            <p className="text-sm text-gray-500">Configure o servidor para envio automático de relatórios</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-6">
        {message && (
          <div className={`p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
          }`}>
            {message.type === 'success' ? <CheckCircle size={20} className="mt-0.5" /> : <AlertCircle size={20} className="mt-0.5" />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <Server size={16} /> Servidor
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Host SMTP</label>
              <input
                type="text"
                name="host"
                value={config.host}
                onChange={handleChange}
                placeholder="smtp.exemplo.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
              {config.host.includes('gmail.com') && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800 leading-tight">
                    <strong>Dica para Gmail:</strong> Use o host <code>smtp.gmail.com</code> e porta <code>587</code>. 
                    Você <strong>DEVE</strong> usar uma <strong>"Senha de App"</strong> se tiver a verificação em duas etapas ativada.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Porta</label>
                <input
                  type="number"
                  name="port"
                  value={config.port}
                  onChange={handleChange}
                  placeholder="587"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      name="secure"
                      checked={config.secure}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">SSL/TLS</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <Shield size={16} /> Autenticação
            </h3>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Usuário / E-mail</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  name="user"
                  value={config.user}
                  onChange={handleChange}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Senha</label>
              <div className="relative">
                <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  name="pass"
                  value={config.pass}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Identidade do Remetente</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Nome Exibido</label>
              <input
                type="text"
                name="fromName"
                value={config.fromName}
                onChange={handleChange}
                placeholder="Consórcio Manager"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">E-mail de Resposta (Opcional)</label>
              <input
                type="email"
                name="fromEmail"
                value={config.fromEmail}
                onChange={handleChange}
                placeholder="seu@email.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Destinatário dos Relatórios</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">E-mail para Receber Relatórios</label>
              <div className="relative">
                <Send size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  name="reportRecipient"
                  value={config.reportRecipient}
                  onChange={handleChange}
                  placeholder="destinatario@email.com"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <p className="text-xs text-gray-500">Este é o e-mail que receberá os relatórios automáticos do sistema.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200"
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
            {isSaving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
          
          <button
            type="button"
            onClick={handleTestEmail}
            disabled={isTesting || !config.host || !config.user || !config.pass || !config.reportRecipient}
            className="flex-1 bg-white border-2 border-gray-200 hover:border-blue-600 hover:text-blue-600 text-gray-700 font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            {isTesting ? 'Enviando...' : 'Enviar E-mail de Teste'}
          </button>
        </div>
      </form>
    </div>
  );
};
