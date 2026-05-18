import React, { useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { useConsortium } from '../store/ConsortiumContext';
import { Building2, LogIn, RefreshCcw, AlertTriangle, Cloud, CloudOff } from 'lucide-react';
import { clearSupabaseConfig } from '../services/supabaseClient';
import { db } from '../services/database';

const Login = () => {
  const { login } = useAuth();
  const { connectionError } = useConsortium();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isCloud = db.isCloudEnabled();

  const handleResetConfig = () => {
    if (window.confirm('Deseja limpar as configurações locais de conexão? Isso pode resolver problemas de login se as chaves do Supabase estiverem incorretas.')) {
      clearSupabaseConfig();
      window.location.reload();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.message && (err.message.includes('API key') || err.message.includes('identity'))) {
        setError('Erro de conexão com o banco de dados. Tente resetar as configurações locais abaixo.');
      } else {
        setError(err.message || 'Erro ao fazer login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4 text-emerald-600">
            <Building2 size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Consórcio Manager</h1>
          <p className="text-slate-500 text-sm mt-1">Faça login para continuar</p>
        </div>

        {connectionError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <AlertTriangle className="text-amber-600 shrink-0" size={20} />
              <div>
                <p className="text-sm font-bold text-amber-900">Problema na Conexão</p>
                <p className="text-xs text-amber-700 mt-1">{connectionError}</p>
                <button 
                  onClick={handleResetConfig}
                  className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors"
                >
                  <RefreshCcw size={14} />
                  Resetar Configurações de Nuvem
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                E-mail de Acesso
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-emerald-200"
          >
            {isLoading ? (
              <span className="animate-pulse">Autenticando...</span>
            ) : (
              <>
                <LogIn size={20} />
                Entrar no Sistema
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isCloud ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {isCloud ? (
              <>
                <Cloud size={12} />
                Conectado à Nuvem
              </>
            ) : (
              <>
                <CloudOff size={12} />
                Modo Local (Sem Nuvem)
              </>
            )}
          </div>

          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Acesso Controlado
            </p>
            {!isCloud && (
              <p className="text-[10px] text-amber-500 mt-1 max-w-[200px]">
                Atenção: Você está no <b>Modo Local</b>. Usuários criados em outros computadores não aparecerão aqui.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
