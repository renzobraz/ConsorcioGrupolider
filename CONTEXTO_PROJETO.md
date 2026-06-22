# Contexto do Projeto — ConsorcioManager Pro

## Visão Geral

Sistema de gestão de consórcios desenvolvido para o **Grupo Líder**, com aspiração de se tornar um produto SaaS comercial. Permite gerenciamento de cotas, pagamentos, contemplações, lances, relatórios e um marketplace para compra e venda de cotas contempladas.

---

## Stack Tecnológica

| Componente | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6.2 |
| Roteamento | React Router DOM 7 (HashRouter, SPA client-side) |
| Estilização | TailwindCSS 4 |
| Backend/DB | Supabase (Auth + Postgres + RLS) |
| Deploy | Vercel (serverless functions + cron via vercel.json) |
| Versionamento | GitHub → auto-deploy na Vercel |
| Testes | Vitest + @vitest/coverage-v8 |
| Email | Gmail SMTP via Supabase (nodemailer) |
| IA | Google Gemini (extração de dados de contratos PDF/imagem) |

## Referências

- **GitHub:** `renzobraz/ConsorcioGrupolider`
- **Vercel:** `consorcio-grupolider2.vercel.app` (projeto: consorcio-grupolider2, framework: Vite)
- **Supabase:** projeto "Consórcio Pro"

---

## Workflow Estabelecido

1. Claude Code analisa, diagnostica e implementa
2. Testes rodam localmente (`npm run test`)
3. Commit + push para `main` no GitHub
4. Vercel faz deploy automático
5. Validação manual em produção

**Regra principal:** antes de qualquer alteração, sempre verificar o estado atual do código antes de modificar. Nunca fazer push sem rodar os testes primeiro.

---

## Estrutura do Projeto

```
├── pages/           (27 páginas — Simulation/, Reports, ExecutiveReport, 
│                     QuotaList, Marketplace, UserManagement, Settings,
│                     TenantAdmin — acesso apenas SUPER_ADMIN)
├── components/      (FilterBar, EmailSettings, SendEmailModal)
├── services/        (calculationService.ts, supabaseClient.ts, database.ts, 
│                     aiService.ts, supabaseValidation.test.ts)
├── utils/           (formatters.ts, validateSupabaseCredentials.ts)
├── store/           (ConsortiumContext.tsx, AuthContext.tsx)
├── api/             (delete-user.ts — Vercel Serverless Function)
├── server/          (scheduler.ts, supabase.ts — usa SUPABASE_SERVICE_ROLE_KEY)
├── supabase/        (migrations/ com 001, 002, 003 — schema versionado no git)
├── constants/       (colunas de relatórios)
├── App.tsx          (router principal com sidebar e proteção de rotas)
├── types.ts         (tipos manuais — sem geração automática do Supabase)
├── BUGS.md          (backlog de bugs com status TDD)
├── vitest.config.ts
└── vercel.json
```

---

## Banco de Dados — Tabelas Principais

| Tabela | Propósito |
|---|---|
| `subscription_plans` | Planos SaaS (preço, limites, features, IDs Mercado Pago) |
| `tenants` | Tenants (clientes SaaS) com status trial/active/suspended/cancelled |
| `quotas` | Cotas — tabela central (~40 colunas), isolada por `tenant_id` |
| `payments` | Parcelas pagas por cota (FC, FR, TA, multa, juros, overrides manuais), isolada por `tenant_id` |
| `correction_indices` | Índices mensais: INCC, IPCA, INPC, CDI e variantes acumuladas — dado público, **sem** isolamento por tenant |
| `administrators` | Cadastro de administradoras, isolada por `tenant_id` |
| `companies` | Empresas compradoras (CPF/CNPJ), isolada por `tenant_id` |
| `credit_usages` | Utilizações de crédito pós-contemplação, isolada por `tenant_id` |
| `manual_transactions` | Aportes e rendimentos manuais por cota, isolada por `tenant_id` |
| `credit_updates` | Atualizações manuais de valor de crédito, isolada por `tenant_id` |
| `users` | Usuários com role (ADMIN/USER/SUPER_ADMIN) e permissions (JSON), isolada por `tenant_id` |
| `smtp_config` | Config SMTP para envio de emails, isolada por `tenant_id` (unique por tenant) |
| `scheduled_reports` | Relatórios agendados (DAILY/WEEKLY/MONTHLY), isolada por `tenant_id` |

---

## Estado dos Testes

**Arquivo:** `services/calculationService.test.ts`
**Cobertura:** 129 testes passando, ~95% statements, ~82% branches

### Funções cobertas em `calculationService.ts`

- `calculateCurrentCreditValue` — reajuste anual com defasagem de índices, teto, freeze pós-contemplação
- `generateSchedule` — cronograma completo (LINEAR/REDUZIDA/SEMESTRAL, lances, correção anual, transações manuais, INDEX_TABLE)
- `calculateScheduleSummary` — agrega pago vs. a pagar por componente
- `calculateCDICorrection` — correção de saldo pelo CDI
- `calculateAverageIndices` — média de índices por período
- `calculateIRR` — TIR via Newton-Raphson

**Arquivo:** `services/supabaseValidation.test.ts`
**Cobertura:** 18 testes para validação de URL e API Key do Supabase

---

## BUGS.md — Status Atual

| # | Severidade | Status | Arquivo |
|---|---|---|---|
| #001 | 🔴 Crítico | ✅ Corrigido | `calculationService.ts` L851–874 + `types.ts` |
| #002 | 🟡 Médio | ✅ Corrigido | `calculationService.ts` L486–490 |
| #003 | 🔴 Crítico | ✅ Corrigido | `calculationService.ts` L863–866 + `types.ts` |
| #004 | 🔵 Baixo | ✅ Corrigido | `calculationService.ts` L68–73 |
| #005 | 🟡 Médio | ✅ Corrigido | `calculationService.ts` L238–242 + L287–288 |

Todos os 5 bugs corrigidos com TDD completo (teste falhou → fix → todos os testes passando).

### Correções aplicadas

**#001 — Override manual FC/TA/FR sem aviso quando saldo = 0:**
`manualFCExcess`, `manualTAExcess`, `manualFRExcess` adicionados em `types.ts` e calculados em `calculationService.ts`.

**#002 — correctionAmountFC/TA/FR vazavam entre meses:**
Reset das variáveis adicionado no início de cada iteração do loop principal.

**#003 — manualEarnings podia tornar balanceFC negativo:**
`earningsToApply = Math.min(manualEarnings, balanceFC_Reais)` + campo `manualEarningsExcess` para auditoria.

**#004 — new Date(UTC) vs createLocalDate em calculateAverageIndices:**
Substituído `new Date(i.date)` por `createLocalDate(i.date)` nas linhas de filtro.

**#005 — Magic keys 0 e -1 em calculateScheduleSummary:**
Exportadas constantes `BID_FREE_PAYMENT_KEY = 0` e `BID_EMBEDDED_PAYMENT_KEY = -1`.

---

## Commits Recentes (ordem cronológica)

```
4e86605  feat(saas): painel de administracao de tenants e planos de assinatura
87fe9bc  fix(simulation): surfacea erros de gravacao de lance que eram silenciados
eb4e7e4  perf(quota-list): memoize CET calculation per page
9fdc66d  refactor(simulation): split Simulation.tsx (~1690 lines) into Simulation/ directory
fad1340  chore(migrations): versiona schema inicial e policies RLS no repositório
6fd87ea  feat(validation): Zod schema em NewQuota com erros inline por campo
329a10e  perf: paginação em QuotaList e Reports + batch queries no buildReport
146979f  feat(security): auditoria RLS completa + corrige server usar service role key
09d8ca6  feat(security): valida formato URL/key Supabase em Settings
```

---

## Features Implementadas

- Sistema de autenticação com Supabase Auth (JWT, `onAuthStateChange`)
- Permissões granulares (14 chaves, 4 perfis pré-definidos)
- Sidebar dinâmica + proteção de rotas
- Gestão de usuários com exclusão via `/api/delete-user`
- Tabela `companies` com suporte a CPF/CNPJ
- Marketplace com verificação de propriedade (modal 2 etapas, `marketplace_status`, `asking_price`, selo de verificação)
- Relatórios agendados (DAILY/WEEKLY/MONTHLY) via Vercel Cron
- Extração de dados de contratos via Google Gemini (PDF/imagem)
- Dashboard Gerencial (`ManagementDashboard.tsx`) com gráficos recharts
- Validação de credenciais Supabase em Settings com confirmação ao trocar URL
- Multi-tenant: cada cliente configura sua própria URL/key via tela de Settings (localStorage tem prioridade sobre env vars — comportamento intencional)
- **Infraestrutura SaaS multi-tenant** (migration `003`): tabelas `subscription_plans` e `tenants`, coluna `tenant_id` em todas as tabelas operacionais, trigger `auto_set_tenant_id`, RLS com isolamento por tenant, funções `get_my_tenant_id()` e `is_super_admin()`
- **Painel SUPER_ADMIN** (`TenantAdmin.tsx`): CRUD de tenants e planos de assinatura, ativação/suspensão/cancelamento de tenants
- **Validação Zod** em `NewQuota.tsx` com erros inline por campo
- Simulation.tsx refatorado em diretório `pages/Simulation/` com ~1690 linhas divididas em componentes

---

## Próximas Prioridades (por ordem de risco)

### 1. ✅ Auditoria de RLS e página pública do Marketplace — CONCLUÍDO

**O que foi feito:**
- Corrigido `server/supabase.ts` para usar `SUPABASE_SERVICE_ROLE_KEY`
- Criado `supabase/rls_setup.sql` + `rls_cleanup.sql`
- Todas as 11 tabelas com RLS ativo, sem acesso anônimo

**Observação futura:** `smtp_config` ainda é acessível a todos os usuários autenticados. Mover envio de e-mail inteiramente para serverless eliminaria essa exposição.

### 2. 🟠 Integração de gateway de pagamento (Mercado Pago) — PENDENTE
A migration `003` já prevê as colunas `mp_plan_id_monthly`, `mp_plan_id_yearly`, `mp_subscription_id`, `mp_preapproval_id`. Falta a integração com a API do Mercado Pago via webhooks assinados no servidor — **nunca confiar no frontend para confirmar aprovação de pagamento**.

### 3. ✅ Paginação no frontend — CONCLUÍDO

**Risco residual:** o contexto ainda carrega todas as cotas na inicialização. Se o volume crescer para milhares de cotas por tenant, será necessário paginação server-side real (`.range()` no Supabase + refatoração do `ConsortiumContext`).

### 4. 🟡 Validação de entrada com Zod — PARCIALMENTE CONCLUÍDO
Feito em `NewQuota.tsx`. Formulários ainda sem Zod: Settings, Administrators, Companies, UserManagement.

### 5. ✅ Migrations versionadas no repositório — CONCLUÍDO
`supabase/migrations/` com `001_initial_schema.sql`, `002_rls_policies.sql`, `003_saas_tenants.sql`.

### 6. ✅ Refatorar Simulation.tsx — CONCLUÍDO
Dividido em `pages/Simulation/` com múltiplos componentes.

### 7. ✅ Infraestrutura SaaS multi-tenant — CONCLUÍDO
Migration `003` aplicada. Painel `TenantAdmin.tsx` implementado. Roles `SUPER_ADMIN` adicionado.

---

## Princípios de Trabalho Estabelecidos

- **TDD para bugs:** escrever o teste correto primeiro → confirmar que falha → aplicar fix mínimo → confirmar que todos os testes passam → atualizar BUGS.md → commit
- **Campos de auditoria em vez de erros silenciosos:** quando overrides excedem saldos disponíveis, usar `Math.min` para limitar e expor o excesso em campos de auditoria (`manualFCExcess`, `manualEarningsExcess`, etc.)
- **Nunca alterar schema de forma destrutiva sem aviso explícito**
- **Nunca fazer push sem rodar a suíte de testes completa**
- **Nunca expor SUPABASE_SERVICE_ROLE_KEY no frontend** (hoje está correto: só em Serverless Functions)
- **Commits pequenos e descritivos** por tema (fix/feat/chore separados)
- **Verificar estado atual antes de qualquer mudança** — git status, git log, leitura dos arquivos relevantes

---

## Variáveis de Ambiente Necessárias (Vercel)

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # só serverless, nunca frontend
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM_NAME
SMTP_FROM_EMAIL
GEMINI_API_KEY
NODE_ENV
```
