# Backlog de Bugs — ConsorcioGrupolider

Bugs identificados durante a escrita de testes unitários (`calculationService.test.ts`).
Cada item segue o fluxo TDD: teste do comportamento **correto** é escrito primeiro,
vemos falhar, depois corrigimos a lógica.

Severidade: 🔴 Crítico (dados financeiros errados) · 🟡 Médio (UI enganosa / dado perdido) · 🔵 Baixo (edge case / refatoração)

---

## #001 — Override manual de TA/FR/FC zerado silenciosamente quando saldo = 0

**Severidade:** 🔴 Crítico  
**Status:** ✅ **CORRIGIDO** em 2026-06-16 — pendente commit  
**Arquivo:** `services/calculationService.ts`  
**Linhas afetadas:** 851–874

### Correção aplicada

O bloco de truncamento que descartava silenciosamente o excesso foi expandido para registrá-lo:

```typescript
// Antes (bugado — para os 3 componentes):
if (installmentTA > balanceTA_Reais) installmentTA = Math.max(0, balanceTA_Reais);

// Depois (corrigido):
if (installmentTA > balanceTA_Reais) {
    if (payment?.manualTA !== undefined && payment?.manualTA !== null)
        manualTAExcess = parseFloat((installmentTA - Math.max(0, balanceTA_Reais)).toFixed(2));
    installmentTA = Math.max(0, balanceTA_Reais);
}
```

- O valor aplicado (`adminFee`, `commonFund`, `reserveFund`) continua sendo truncado ao saldo disponível — comportamento correto.
- O excesso (`manualTA - saldo`) é armazenado em `manualTAExcess` / `manualFCExcess` / `manualFRExcess` para exibição/auditoria na UI.
- O campo de excesso é `undefined` quando não há override manual (truncamentos normais de última parcela não geram excesso).
- Três novos campos adicionados em `types.ts`: `manualFCExcess`, `manualTAExcess`, `manualFRExcess` (todos `?: number`).

### Testes (TDD)

- Baseline `[BUG CONHECIDO]` substituído por: `'manualTA excedendo saldo disponível: aplica até o saldo e registra excesso em manualTAExcess'`
- Teste `manualFC maior que saldo` ganhou assertion `manualFCExcess ≈ 87999`
- Teste `manualFR maior que saldo` ganhou assertion `manualFRExcess ≈ 98799`
- 109/109 passando após o fix, zero regressões.

---

## #002 — `correctionAmountFC/TA/FR` vazam para todas as parcelas pós-aniversário

**Severidade:** 🟡 Médio (dado incorreto exibido na UI, não afeta saldo financeiro)  
**Status:** ✅ **CORRIGIDO** em 2026-06-16 — pendente commit  
**Arquivo:** `services/calculationService.ts`  
**Linhas afetadas:** 486–490 (reset adicionado)

### Correção aplicada

Adicionado reset das variáveis no início de cada iteração do loop, antes do bloco `if (firstAssemblyDate)`:

```typescript
// Reset correction deltas every iteration — only valid for the month correction fires
correctionAmountFC = 0;
correctionAmountTA = 0;
correctionAmountFR = 0;
correctionAmountTotal = 0;
```

O bloco `else` em L609-613 que já zerava as variáveis quando `firstAssemblyDate` é vazio tornou-se redundante (mas inofensivo e foi mantido).

### Testes (TDD)

- Novo teste adicionado ao Bloco D: `'correctionAmountFC/TA/FR zerados em meses não-aniversário — não vazam do mês de reajuste'`
- Confirmado falhando com `expected 6341.25 to be 0` (valor do mês 13 vazando para o mês 14)
- 110/110 passando após o fix, zero regressões.

---

## #003 — `manualEarnings` pode tornar `balanceFC_Reais` negativo sem limitação

**Severidade:** 🔴 Crítico (pode zerar silenciosamente todas as parcelas restantes)  
**Status:** ✅ **CORRIGIDO** em 2026-06-16 — commit a ser gerado  
**Arquivo:** `services/calculationService.ts`  
**Linhas afetadas:** 863–866

### Correção aplicada

```typescript
// Antes (bugado):
balanceFC_Reais -= payment.manualEarnings;

// Depois (corrigido):
const earningsToApply = Math.min(payment.manualEarnings, Math.max(0, balanceFC_Reais));
manualEarningsExcess = payment.manualEarnings - earningsToApply;
balanceFC_Reais -= earningsToApply;
```

- `balanceFC_Reais` nunca vai abaixo de zero.
- O excesso (`manualEarnings - saldo disponível`) é armazenado em `PaymentInstallment.manualEarningsExcess` para exibição/auditoria na UI.
- `actualRateFC` passou a usar o valor efetivamente aplicado (`appliedEarnings`), não o valor bruto digitado.
- Novo campo adicionado em `types.ts`: `manualEarningsExcess?: number`.

### Testes (TDD)

- Teste de comportamento correto: `'manualEarnings > saldo FC: limita ao saldo, balanceFC vai a exatamente zero e excesso fica em manualEarningsExcess'`
- Teste normal (sem excesso) ganhou assertion `expect(schedule[0].manualEarningsExcess).toBeUndefined()`
- 109/109 passando após o fix, zero regressões.

---

## #004 — `calculateAverageIndices` usa `new Date(i.date)` (UTC) em vez de `createLocalDate` (local)

**Severidade:** 🔵 Baixo (edge case em datas de fronteira de período)  
**Arquivo:** `services/calculationService.ts`  
**Linhas:** 70–71

### Descrição

```typescript
// L70–71 — usa UTC
const relevantIndices = indices.filter(i =>
    i.type === type &&
    new Date(i.date) >= startDate &&   // ← new Date('2020-01-01') = UTC midnight
    new Date(i.date) <= today &&
    i.rate !== 0
);
```

`new Date('2020-01-01')` em JavaScript interpreta a string como **UTC midnight** (00:00:00 UTC).
No fuso horário de Brasília (UTC-3), isso equivale a **31/Dez/2019 às 21:00 local**.

Enquanto isso, `startDate` é criado com `new Date()` (horário local), gerando uma comparação
entre um Date UTC e um Date local — inconsistência que pode excluir incorretamente o primeiro
índice do período.

### Impacto

- Afeta apenas `calculateAverageIndices`, que é usada para **projeções futuras** quando não há índices históricos.
- Produção de saldos levemente errados em projeções de cenários futuros.
- Não afeta cálculos com dados históricos reais (onde os índices existem).

### Correção sugerida

Substituir `new Date(i.date)` por `createLocalDate(i.date)` nas linhas 70–71:

```typescript
const idxDate = createLocalDate(i.date);
return i.type === type && idxDate >= startDate && idxDate <= today && i.rate !== 0;
```

**Supabase schema:** Nenhuma alteração necessária.

---

## #005 — `calculateScheduleSummary` usa magic keys `payments[0]` e `payments[-1]` para lances

**Severidade:** 🟡 Médio (dados financeiros incorretos em relatórios quando lances não estão marcados como pagos)  
**Status:** ✅ **CORRIGIDO** em 2026-06-16 — pendente commit  
**Arquivo:** `services/calculationService.ts`  
**Linhas afetadas:** 238–242 (constantes adicionadas) e 287–288 (uso das constantes)

### Correção aplicada

Exportadas duas constantes antes de `calculateScheduleSummary` para tornar a convenção explícita:

```typescript
export const BID_FREE_PAYMENT_KEY = 0 as const;
export const BID_EMBEDDED_PAYMENT_KEY = -1 as const;
```

Literais mágicos `payments[0]` e `payments[-1]` substituídos:

```typescript
// Antes:
const isFreeBidPaid    = payments[0]?.status === 'PAGO';
const isEmbeddedBidPaid = payments[-1]?.status === 'PAGO';

// Depois:
const isFreeBidPaid    = payments[BID_FREE_PAYMENT_KEY]?.status === 'PAGO';
const isEmbeddedBidPaid = payments[BID_EMBEDDED_PAYMENT_KEY]?.status === 'PAGO';
```

Callers existentes (Simulation.tsx, Dashboard.tsx, scheduler.ts etc.) já usavam `installmentNumber = 0/-1` para lances no banco — continuam funcionando sem alteração.

### Testes (TDD)

- Baseline `[BUG CONHECIDO #005]` substituído por: `'lances usam BID_FREE/EMBEDDED_PAYMENT_KEY — constantes exportadas tornam a convenção explícita'`
- Import atualizado no test file para incluir `BID_FREE_PAYMENT_KEY, BID_EMBEDDED_PAYMENT_KEY`
- 110/110 passando após o fix, zero regressões.

---

## Passos para corrigir cada bug com TDD

| # | Prioridade | Teste correto primeiro | Corrigir `calculationService.ts` | Schema Supabase |
|---|---|---|---|---|
| #001 | ✅ Corrigido | — | Linhas 851–874 + types.ts | Não |
| #003 | ✅ Corrigido | — | Linhas 863–866 + types.ts | Não |
| #002 | ✅ Corrigido | — | Linhas 486–490 (reset no início do loop) | Não |
| #005 | ✅ Corrigido | — | Linhas 238–242 + 287–288 (constantes exportadas) | Não |
| #004 | 🔵 Baixa | Sim — índice de fronteira de período incluído | Linhas 70–71 | Não |
