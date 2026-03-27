
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { 
  LayoutDashboard, PlusCircle, Table, Calculator, Menu, X, PiggyBank, 
  List, Settings as SettingsIcon, Cloud, CloudOff, TrendingUp, 
  AlertCircle, FileBarChart, Building2, Briefcase, BookOpen, 
  ShoppingBag, FileText, ChevronLeft, ChevronRight, CalendarDays,
  CalendarClock,
  Activity, Loader, CheckCircle 
} from 'lucide-react';

// Components
import Dashboard from './pages/Dashboard';
import ManagementDashboard from './pages/ManagementDashboard';
import NewQuota from './pages/NewQuota';
import Simulation from './pages/Simulation';
import QuotaList from './pages/QuotaList';
import Settings from './pages/Settings';
import CorrectionIndices from './pages/CorrectionIndices';
import Reports from './pages/Reports';
import MonthlyPaidReport from './pages/MonthlyPaidReport';
import MonthlyDetailReport from './pages/MonthlyDetailReport';
import Administrators from './pages/Administrators';
import Companies from './pages/Companies';
import Manual from './pages/Manual';
import CalculatorTool from './pages/CalculatorTool';
import CreditUsage from './pages/CreditUsage'; 
import CreditManagement from './pages/CreditManagement';
import CreditUsageReport from './pages/CreditUsageReport';
import AccountsPayable from './pages/AccountsPayable';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import { ConsortiumProvider, useConsortium } from './store/ConsortiumContext';
import { AuthProvider, useAuth } from './store/AuthContext';
import { db } from './services/database';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  toggleMobile: () => void;
  toggleCollapse: () => void;
}

const Sidebar = ({ isOpen, isCollapsed, toggleMobile, toggleCollapse }: SidebarProps) => {
  const location = useLocation();
  const { hasPermission, isAdmin, user } = useAuth();
  
  const isActive = (path: string) => location.pathname === path 
    ? "bg-emerald-600 text-white shadow-lg" 
    : "text-slate-300 hover:bg-slate-800 hover:text-white";

  const navItems = [
    { to: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard", show: hasPermission('canViewDashboard') },
    { to: "/dashboard/gerencial", icon: <Activity size={20} />, label: "Dashboard Gerencial", show: hasPermission('canViewDashboard') },
    { to: "/quotas", icon: <List size={20} />, label: "Minhas Cotas", show: true },
    { to: "/new", icon: <PlusCircle size={20} />, label: "Novo Cadastro", show: hasPermission('canManageQuotas') },
    { to: "/simulate", icon: <Calculator size={20} />, label: "Simulador / Extrato", show: hasPermission('canSimulate') },
    { to: "/reports", icon: <FileBarChart size={20} />, label: "Relatório por Cota", show: hasPermission('canViewReports') },
    { to: "/reports/monthly", icon: <CalendarDays size={20} />, label: "Fluxo Mensal Pago", show: hasPermission('canViewReports') },
    { to: "/credit-management", icon: <ShoppingBag size={20} />, label: "Gestão de Créditos", show: hasPermission('canManageQuotas') },
    { to: "/reports/usage", icon: <FileText size={20} />, label: "Relatório Uso de Créditos", show: hasPermission('canViewReports') },
    { to: "/accounts-payable", icon: <CalendarClock size={20} />, label: "Contas a Pagar", show: hasPermission('canViewReports') },
    { to: "/calculator", icon: <TrendingUp size={20} />, label: "Calculadora Avulsa", show: hasPermission('canSimulate') },
  ].filter(item => item.show);

  const registryItems = [
    { to: "/administrators", icon: <Building2 size={20} />, label: "Administradoras", show: hasPermission('canManageSettings') },
    { to: "/companies", icon: <Briefcase size={20} />, label: "Empresas", show: hasPermission('canManageSettings') },
    { to: "/indices", icon: <TrendingUp size={20} />, label: "Índices Correção", show: hasPermission('canManageSettings') },
  ].filter(item => item.show);

  const systemItems = [
    { to: "/manual", icon: <BookOpen size={20} />, label: "Manual do Sistema", show: true },
    { to: "/settings", icon: <SettingsIcon size={20} />, label: "Configurações", show: hasPermission('canManageSettings') },
    { to: "/users", icon: <Building2 size={20} />, label: "Usuários", show: isAdmin },
  ].filter(item => item.show);

  return (
    <div 
      className={`fixed inset-y-0 left-0 z-30 bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0 
        ${isCollapsed ? 'w-20' : 'w-64'} 
        print:hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className={`flex items-center gap-2 font-bold text-xl tracking-tight overflow-hidden whitespace-nowrap transition-all ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
          <PiggyBank className="text-emerald-500 shrink-0" />
          <span>Consórcio<span className="text-emerald-500">Pro</span></span>
        </div>
        
        {isCollapsed && (
          <div className="flex-1 flex justify-center">
             <PiggyBank className="text-emerald-500" size={24} />
          </div>
        )}

        <button onClick={toggleMobile} className="md:hidden text-slate-400 hover:text-white">
          <X size={24} />
        </button>
        
        <button 
          onClick={toggleCollapse} 
          className="hidden md:flex text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          title={isCollapsed ? "Expandir" : "Recolher"}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden mt-4 px-3 flex flex-col gap-1 custom-scrollbar">
        {navItems.map((item) => (
          <Link 
            key={item.to} 
            to={item.to} 
            title={isCollapsed ? item.label : ""}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive(item.to)} ${isCollapsed ? 'justify-center' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!isCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
          </Link>
        ))}

        <div className={`my-4 border-t border-slate-800 transition-all ${isCollapsed ? 'mx-2' : 'mx-1'}`}></div>
        {!isCollapsed && <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Cadastros</p>}

        {registryItems.map((item) => (
          <Link 
            key={item.to} 
            to={item.to} 
            title={isCollapsed ? item.label : ""}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive(item.to)} ${isCollapsed ? 'justify-center' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!isCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
          </Link>
        ))}

        <div className={`my-4 border-t border-slate-800 transition-all ${isCollapsed ? 'mx-2' : 'mx-1'}`}></div>

        {systemItems.map((item) => (
          <Link 
            key={item.to} 
            to={item.to} 
            title={isCollapsed ? item.label : ""}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive(item.to)} ${isCollapsed ? 'justify-center' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!isCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
          </Link>
        ))}
      </nav>
      
      {/* Footer Info */}
      <div className={`p-4 bg-slate-950/50 border-t border-slate-800 transition-all ${isCollapsed ? 'items-center px-0' : ''}`}>
          {!isCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                {user?.name.substring(0, 2).toUpperCase() || 'AD'}
              </div>
              <div className="text-xs truncate">
                <p className="font-bold text-slate-200">{user?.name || 'Administrador'}</p>
                <p className="text-slate-500">{user?.email || 'admin@consorcio.com'}</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs mx-auto">
              {user?.name.substring(0, 2).toUpperCase() || 'AD'}
            </div>
          )}
      </div>
    </div>
  );
};

const ConnectionStatus = () => {
  const { isCloudConnected, isLoading, connectionError } = useConsortium();
  
  if (connectionError) {
    return (
      <Link to="/settings" title={connectionError} className="flex items-center gap-2 text-xs text-white bg-red-500 px-3 py-1.5 rounded-full border border-red-600 hover:bg-red-600 transition-colors cursor-pointer animate-pulse">
        <AlertCircle size={14} />
        <span className="font-medium truncate max-w-[120px] md:max-w-[150px]">Erro: {connectionError}</span>
      </Link>
    );
  }

  if (isLoading) return (
    <Link to="/settings" className="flex items-center gap-2 text-xs text-slate-400 hover:text-emerald-600 transition-colors">
      <span className="animate-pulse">●</span> Sincronizando...
    </Link>
  );

  return isCloudConnected ? (
    <Link to="/settings" title="Conectado ao Supabase" className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors cursor-pointer">
      <Cloud size={14} />
      <span className="font-medium hidden sm:inline">Cloud Ativa</span>
    </Link>
  ) : (
    <Link to="/settings" title="Clique para configurar o banco de dados" className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer group">
      <CloudOff size={14} className="group-hover:text-red-500" />
      <span className="font-medium hidden sm:inline">Modo Offline</span>
    </Link>
  );
};

const SupabaseSyncWarning = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [missingItems, setMissingItems] = useState<string[]>([]);
  const isCloud = db.isCloudEnabled();

  // Initial check to hide if already exists
  useEffect(() => {
    if (isCloud) {
      const checkAll = async () => {
        const missing = [];
        const hasColumn = await db.checkColumnExists('quotas', 'is_draw_contemplation');
        if (!hasColumn) missing.push('column_is_draw');
        
        const hasTable = await db.checkTableExists('manual_transactions');
        if (!hasTable) missing.push('table_manual_tx');
        
        setMissingItems(missing);
        if (missing.length === 0) setIsVisible(false);
      };
      checkAll();
    }
  }, [isCloud]);

  if (!isCloud || !isVisible || missingItems.length === 0) return null;

  const handleCheck = async () => {
    setIsChecking(true);
    try {
      const missing = [];
      const hasColumn = await db.checkColumnExists('quotas', 'is_draw_contemplation');
      if (!hasColumn) missing.push('column_is_draw');
      
      const hasTable = await db.checkTableExists('manual_transactions');
      if (!hasTable) missing.push('table_manual_tx');
      
      setMissingItems(missing);
      if (missing.length === 0) {
        alert('Tudo verificado com sucesso! O banco está sincronizado.');
        setIsVisible(false);
      } else {
        alert('Alguns itens ainda não foram encontrados. Certifique-se de executar os comandos SQL no Supabase.');
      }
    } catch (err) {
      alert('Erro ao verificar. Tente novamente.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between gap-4 print:hidden">
      <div className="flex items-center gap-3 text-amber-800">
        <AlertCircle size={20} className="shrink-0" />
        <div className="text-xs">
          <p className="font-bold uppercase tracking-wider mb-1">Sincronização Supabase Necessária</p>
          <p className="mb-2">Para habilitar todas as funcionalidades, execute os comandos abaixo no SQL Editor do Supabase:</p>
          
          <div className="space-y-2">
            {missingItems.includes('column_is_draw') && (
              <div>
                <p className="font-semibold text-[10px] text-amber-700 mb-1">1. Habilitar Lance por Sorteio:</p>
                <code className="bg-amber-100 px-2 py-1 rounded block font-mono text-[10px] border border-amber-200 select-all">
                  ALTER TABLE quotas ADD COLUMN IF NOT EXISTS is_draw_contemplation BOOLEAN DEFAULT FALSE;
                </code>
              </div>
            )}
            
            {missingItems.includes('table_manual_tx') && (
              <div>
                <p className="font-semibold text-[10px] text-amber-700 mb-1">2. Criar Tabela de Transações Manuais:</p>
                <code className="bg-amber-100 px-2 py-1 rounded block font-mono text-[10px] border border-amber-200 select-all whitespace-pre-wrap">
                  {`CREATE TABLE IF NOT EXISTS manual_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  fc DECIMAL(15,2) DEFAULT 0,
  fr DECIMAL(15,2) DEFAULT 0,
  ta DECIMAL(15,2) DEFAULT 0,
  insurance DECIMAL(15,2) DEFAULT 0,
  amortization DECIMAL(15,2) DEFAULT 0,
  fine DECIMAL(15,2) DEFAULT 0,
  interest DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);`}
                </code>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button 
          onClick={handleCheck}
          disabled={isChecking}
          className="px-4 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] font-bold uppercase rounded border border-amber-300 transition-colors flex items-center gap-1 disabled:opacity-50 shadow-sm"
        >
          {isChecking ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Verificar Sincronização
        </button>
        <button 
          onClick={() => setIsVisible(false)}
          className="text-amber-400 hover:text-amber-600 p-1 rounded-md hover:bg-amber-100 transition-colors flex items-center gap-1 text-[10px]"
        >
          <X size={14} /> Ignorar por agora
        </button>
      </div>
    </div>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, logout, isLoading } = useAuth();

  // Auto-collapse on smaller screens but not mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth < 1280) {
        setIsCollapsed(true);
      } else if (window.innerWidth >= 1280) {
        setIsCollapsed(false);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Carregando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        isCollapsed={isCollapsed}
        toggleMobile={() => setIsSidebarOpen(!isSidebarOpen)} 
        toggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />
      
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'} print:ml-0`}>
        <header className="bg-white h-16 border-b border-slate-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20 shadow-sm print:hidden">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-600 hover:bg-slate-100 p-2 rounded-lg">
            <Menu size={24} />
          </button>
          
          <div className="hidden md:block">
             <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Painel Administrativo</h2>
          </div>
          
          <div className="flex items-center gap-4">
             <ConnectionStatus />
             <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
             <div className="flex items-center gap-2">
                <div className="hidden md:block text-right">
                    <p className="text-sm font-bold text-slate-700 leading-none">{user.name}</p>
                    <button onClick={logout} className="text-[10px] text-slate-400 mt-1 uppercase hover:text-red-500 transition-colors">Sair do sistema</button>
                </div>
             </div>
          </div>
        </header>
        
        <SupabaseSyncWarning />
        
        <main className="p-4 md:p-8 flex-1 overflow-y-auto print:p-0 print:overflow-visible custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children, permission }: { children: React.ReactNode, permission?: keyof import('./types').UserPermissions }) => {
  const { user, hasPermission, isAdmin } = useAuth();
  
  if (!user) return <Navigate to="/" replace />;
  if (permission && !hasPermission(permission) && !isAdmin) return <Navigate to="/quotas" replace />;
  
  return <>{children}</>;
};

const App = () => {
  return (
    <AuthProvider>
      <ConsortiumProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<ProtectedRoute permission="canViewDashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/gerencial" element={<ProtectedRoute permission="canViewDashboard"><ManagementDashboard /></ProtectedRoute>} />
              <Route path="/quotas" element={<ProtectedRoute><QuotaList /></ProtectedRoute>} />
              <Route path="/new" element={<ProtectedRoute permission="canManageQuotas"><NewQuota /></ProtectedRoute>} />
              <Route path="/edit/:id" element={<ProtectedRoute permission="canManageQuotas"><NewQuota /></ProtectedRoute>} />
              <Route path="/usage/:id" element={<ProtectedRoute permission="canManageQuotas"><CreditUsage /></ProtectedRoute>} />
              <Route path="/simulate" element={<ProtectedRoute permission="canSimulate"><Simulation /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute permission="canViewReports"><Reports /></ProtectedRoute>} />
              <Route path="/reports/monthly" element={<ProtectedRoute permission="canViewReports"><MonthlyPaidReport /></ProtectedRoute>} />
              <Route path="/reports/monthly/:monthYear" element={<ProtectedRoute permission="canViewReports"><MonthlyDetailReport /></ProtectedRoute>} />
              <Route path="/reports/usage" element={<ProtectedRoute permission="canViewReports"><CreditUsageReport /></ProtectedRoute>} />
              <Route path="/accounts-payable" element={<ProtectedRoute permission="canViewReports"><AccountsPayable /></ProtectedRoute>} />
              <Route path="/indices" element={<ProtectedRoute permission="canManageSettings"><CorrectionIndices /></ProtectedRoute>} />
              <Route path="/administrators" element={<ProtectedRoute permission="canManageSettings"><Administrators /></ProtectedRoute>} />
              <Route path="/companies" element={<ProtectedRoute permission="canManageSettings"><Companies /></ProtectedRoute>} />
              <Route path="/credit-management" element={<ProtectedRoute permission="canManageQuotas"><CreditManagement /></ProtectedRoute>} />
              <Route path="/manual" element={<ProtectedRoute><Manual /></ProtectedRoute>} />
              <Route path="/calculator" element={<ProtectedRoute permission="canSimulate"><CalculatorTool /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute permission="canManageSettings"><Settings /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </HashRouter>
      </ConsortiumProvider>
    </AuthProvider>
  );
};

export default App;
