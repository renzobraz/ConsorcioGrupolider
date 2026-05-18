import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../services/supabaseClient';
import { Key, Save, AlertCircle, CheckCircle } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Verifica se temos uma sessão ativa (o Supabase já deve ter processado o token do fragmento)
    const checkSession = async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Se não houver sessão, redireciona para o login (o token pode ter expirado ou ser inválido)
        setError('Sessão de recuperação inválida ou expirada.');
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => {
        window.location.href = window.location.origin;
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar senha.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6 text-emerald-600 mx-auto">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Senha Atualizada!</h2>
          <p className="text-slate-600 mb-6">
            Sua senha foi redefinida com sucesso. Você será redirecionado para o login em instantes.
          </p>
          <button
            onClick={() => {
              window.location.href = window.location.origin;
            }}
            className="text-emerald-600 font-bold hover:underline"
          >
            Ir para o Login agora
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 text-blue-600">
            <Key size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Nova Senha</h1>
          <p className="text-slate-500 text-sm mt-1 text-center">
            Defina sua nova senha de acesso abaixo.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 flex gap-3 border border-red-100">
            <AlertCircle size={20} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nova Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-blue-200"
          >
            {isLoading ? (
              <span className="animate-pulse">Atualizando...</span>
            ) : (
              <>
                <Save size={20} />
                Definir Nova Senha
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
