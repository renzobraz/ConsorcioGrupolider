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
├── pages/           (26 páginas — Simulation, Reports, ExecutiveReport, 
│                     QuotaList, Marketplace, UserManagement, Settings...)
├── components/      (FilterBar, EmailSettings, SendEmailModal)
├── services/        (calculationService.ts, supabaseClient.ts, database.ts, 
│                     aiService.ts, supabaseValidation.test.ts)
├── utils/           (formatters.ts, validateSupabaseCredentials.ts)
├── store/           (ConsortiumContext.tsx, AuthContext.tsx)
├── api/             (delete-user.ts — Vercel Serverless Function)
├── server/          (scheduler.ts, supabase.ts — usa SUPABASE_SERVICE_ROLE_KEY)
├── supabase/        (rls_setup.sql, rls_cleanup.sql — migrations versionadas)
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
| `quotas` | Cotas — tabela central (~40 colunas) |
| `payments` | Parcelas pagas por cota (FC, FR, TA, multa, juros, overrides manuais) |
| `correction_indices` | Índices mensais: INCC, IPCA, INPC, CDI e variantes acumuladas |
| `administrators` | Cadastro de administradoras |
| `companies` | Empresas compradoras (CPF/CNPJ) |
| `credit_usages` | Utilizações de crédito pós-contemplação |
| `manual_transactions` | Aportes e rendimentos manuais por cota |
| `credit_updates` | Atualizações manuais de valor de crédito |
| `users` | Usuários com role (ADMIN/USER) e permissions (JSON) |
| `smtp_config` | Config SMTP para envio de emails |
| `scheduled_reports` | Relatórios agendados (DAILY/WEEKLY/MONTHLY) |

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
09d8ca6  feat(security): valida formato URL/key Supabase em Settings + confirmação ao trocar credenciais
d840818  chore: adiciona coverage/ ao .gitignore
d16c904  chore: @vitest/coverage-v8 como devDependency
ac9c0f6  fix(calculationService): corrige 4 bugs críticos via TDD (110 testes passando)
810c501  ManagementDashboard + integração App.tsx
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

---

## Próximas Prioridades (por ordem de risco)

### 1. ✅ Auditoria de RLS e página pública do Marketplace — CONCLUÍDO

**O que foi encontrado:**
- O Marketplace NÃO é uma página pública — todas as rotas exigem login (`Layout` retorna `<Login />` se sem usuário)
- 11 tabelas tinham policies inseguras: `"Allow select for all"`, `"public_read_*"` etc., que concediam acesso ao role `anon` — qualquer pessoa com a `anon key` conseguia ler todos os dados via API REST diretamente
- `server/supabase.ts` usava `SUPABASE_ANON_KEY` em vez de `SUPABASE_SERVICE_ROLE_KEY`, o que quebraria o scheduler após ativar RLS

**O que foi feito:**
- Corrigido `server/supabase.ts` para usar `SUPABASE_SERVICE_ROLE_KEY`
- Criado `supabase/rls_setup.sql` com as policies corretas
- Criado `supabase/rls_cleanup.sql` para remover as policies inseguras antigas
- Aplicado no Supabase: todas as 11 tabelas agora têm `rls_enabled = true` e apenas a policy `authenticated_full_access` (acesso total para `authenticated`, zero para `anon`)

**Observação futura:** `smtp_config` ainda é acessível a todos os usuários autenticados porque o frontend lê as credenciais SMTP para enviar e-mails via `/api/send-email`. Mover o envio totalmente para serverless eliminaria essa exposição.

### 2. 🟠 Integração de gateway de pagamento
**Decisão pendente:** escolher o gateway (Stripe, Mercado Pago, PagSeguro). A integração deve usar webhooks assinados para confirmar pagamentos no servidor — nunca confiar no frontend para confirmar aprovação de pagamento.

### 3. ✅ Paginação no frontend — CONCLUÍDO

**O que foi feito:**
- `QuotaList.tsx`: paginação de UI com `PAGE_SIZE = 50`, reset automático ao filtrar/ordenar, controles de navegação.
- `Reports.tsx`: paginação de UI com `REPORTS_PAGE_SIZE = 50`, paginação no mobile (cards) e desktop (tabela).
- `QuotaList.tsx`: cálculo de CET Anual (`generateSchedule` + `calculateIRR`) movido para `useMemo` por página, evitando recomputação a cada re-render.

**Risco residual:** o contexto ainda carrega todas as cotas na inicialização. Se o volume crescer para milhares de cotas por tenant, será necessário implementar paginação server-side real (query com `.range()` por página no Supabase + refatoração do `ConsortiumContext`).

### 4. 🟡 Validação de entrada com Zod
Formulários principais sem validação de schema (só checagens ad-hoc inline). Especialmente crítico nos formulários que alimentam o `calculationService.ts`.

### 5. 🟡 Migrations versionadas no repositório
Schema só existe no Supabase Cloud, sem histórico no Git. Risco de perda de rastreabilidade.

### 6. 🟡 Refatorar Simulation.tsx
~2.500 linhas misturando UI, cálculo e estado. Vale extrair lógica para serviço testável.

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
