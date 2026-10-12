import { BANK_LOANS, DEFAULT_PENALTY, EQUIPMENT_FINANCE, INSURANCE_PREMIUM, MAINTENANCE, UPGRADES, WAGE_PER_DAY, type UpgradeId } from './config';
import { buyerOf, contractValue } from './contracts';
import { applyUpgrade, ownsUpgrade, upgradeBlocked } from './economy';
import { autoIrrigate } from './irrigation';
import { lockedReason } from './levels';
import { addXp, fail, log, money, spend } from './state';
import type { GameState, LogLine } from './types';

export const totalDebt = (s: GameState) => s.loans.reduce((sum, l) => sum + l.balance, 0);
export const creditLimit = (s: GameState) => 1_000_000 + s.level * 100_000;

export function loanBlocked(s: GameState): string | null {
  const locked = lockedReason(s, 'bankLoans');
  if (locked) return `Bank loans: ${locked}.`;
  if (s.creditBlocked) return 'The bank refuses new credit until your defaulted loan is repaid.';
  if (s.loans.filter(l => l.kind === 'bank').length >= 2) return 'You already have two bank loans.';
  return null;
}

/** Bank of Agriculture working-capital loan. */
export function takeLoan(s: GameState, index: number): GameState {
  const offer = BANK_LOANS[index];
  if (!offer) return s;
  const why = loanBlocked(s);
  if (why) return fail(s, why);
  if (totalDebt(s) + offer.amount > creditLimit(s)) return fail(s, `That would take you over your ${money(creditLimit(s))} credit limit.`);
  const loan = { id: s.nextId, kind: 'bank' as const, label: 'Bank of Agriculture loan', principal: offer.amount, balance: offer.amount, dailyRate: offer.annualRate / 365, dueDay: s.day + offer.days, defaulted: false };
  // Borrowed money is cash, not revenue.
  const next = { ...s, cash: s.cash + offer.amount, nextId: s.nextId + 1, loans: [...s.loans, loan] };
  return log({ ...next, toast: `Borrowed ${money(offer.amount)} at ${Math.round(offer.annualRate * 100)}% a year. Repay by day ${loan.dueDay}.` }, { text: `Took a ${money(offer.amount)} bank loan, due day ${loan.dueDay}.`, severity: 'info' });
}

/** Buy equipment with a down payment; the rest becomes an equipment loan. */
export function financeUpgrade(s: GameState, id: UpgradeId): GameState {
  const locked = lockedReason(s, 'equipmentFinance');
  if (locked) return fail(s, `Equipment financing: ${locked}.`);
  if (s.creditBlocked) return fail(s, 'No financing while you have a defaulted loan.');
  const no = upgradeBlocked(s, id);
  if (no) return fail(s, no);
  const u = UPGRADES[id];
  const down = Math.round(u.cost * EQUIPMENT_FINANCE.downPayment), financed = u.cost - down;
  if (s.cash < down) return fail(s, `You need ${money(down)} for the down payment.`);
  if (totalDebt(s) + financed > creditLimit(s)) return fail(s, `That would take you over your ${money(creditLimit(s))} credit limit.`);
  const loan = { id: s.nextId, kind: 'equipment' as const, label: `${u.label} financing`, principal: financed, balance: financed, dailyRate: EQUIPMENT_FINANCE.annualRate / 365, dueDay: s.day + EQUIPMENT_FINANCE.days, defaulted: false };
  const installed = applyUpgrade({ ...spend(s, down), nextId: s.nextId + 1, loans: [...s.loans, loan] }, id);
  const next = id === 'irrigation' ? autoIrrigate(installed).state : installed;
  return addXp(log({ ...next, toast: `${u.label} installed: ${money(down)} down, ${money(financed)} financed until day ${loan.dueDay}.` }, { text: `Financed ${u.label.toLowerCase()} (${money(financed)} owed).`, severity: 'info' }), 40);
}

export function repayLoan(s: GameState, id: number, amount?: number): GameState {
  const loan = s.loans.find(l => l.id === id);
  if (!loan) return s;
  const pay = Math.min(s.cash, loan.balance, amount ?? loan.balance);
  if (pay <= 0) return fail(s, 'No cash to repay with.');
  const loans = s.loans.map(l => (l.id === id ? { ...l, balance: l.balance - pay } : l)).filter(l => l.balance > 1);
  const next = { ...s, cash: s.cash - pay, loans, creditBlocked: loans.some(l => l.defaulted) };
  return { ...next, toast: loans.some(l => l.id === id) ? `Repaid ${money(pay)}.` : `${loan.label} fully repaid.` };
}

/** Daily: interest accrues; loans that fall due are collected, or go into default. */
export function tickLoans(s: GameState, lines: LogLine[]): GameState {
  let cash = s.cash, interest = 0, reputation = s.reputation;
  const loans = s.loans.flatMap(l => {
    const accrued = l.balance * l.dailyRate;
    interest += accrued;
    const loan = { ...l, balance: l.balance + accrued };
    if (s.day < loan.dueDay) return [loan];
    if (cash >= loan.balance) {
      cash -= loan.balance;
      lines.push({ text: `${loan.label} repaid in full: ${money(loan.balance)}.`, severity: 'good' });
      return [];
    }
    reputation = Math.max(0, reputation - 5);
    lines.push({ text: `Could not repay the ${loan.label.toLowerCase()} (${money(loan.balance)} due). Default: ${Math.round(DEFAULT_PENALTY * 100)}% penalty and no new credit until it is cleared.`, severity: 'danger' });
    return [{ ...loan, balance: loan.balance * (1 + DEFAULT_PENALTY), dueDay: s.day + 30, defaulted: true }];
  });
  return {
    ...s, cash, reputation, loans, creditBlocked: loans.some(l => l.defaulted),
    finance: { ...s.finance, interest: s.finance.interest + interest, expenses: s.finance.expenses + (s.cash - cash) },
  };
}

export function maintenanceCost(s: GameState) {
  return (Object.keys(MAINTENANCE) as UpgradeId[]).reduce((sum, id) => sum + (ownsUpgrade(s, id) ? MAINTENANCE[id]! : 0), 0);
}
export const dailyFixedCosts = (s: GameState) => s.workers * WAGE_PER_DAY + (s.upgrades.insurance ? INSURANCE_PREMIUM : 0) + maintenanceCost(s);

export interface CashPoint { day: number; cash: number; note?: string }

/**
 * Where cash is heading over the next `days`: fixed daily costs and loan repayments out,
 * contract payments in. Does not include sales you haven't made yet.
 */
export function cashForecast(s: GameState, days = 30): CashPoint[] {
  const burn = dailyFixedCosts(s);
  let cash = s.cash;
  const points: CashPoint[] = [{ day: s.day, cash }];
  for (let d = s.day + 1; d <= s.day + days; d++) {
    cash -= burn;
    const notes: string[] = [];
    for (const l of s.loans) if (l.dueDay === d) { cash -= l.balance * (1 + l.dailyRate * (d - s.day)); notes.push(`${l.label} due`); }
    for (const sh of s.shipments) {
      const c = s.contracts.find(x => x.id === sh.contractId);
      if (!c || sh.stage === 'paid' || sh.stage === 'lost') continue;
      const b = buyerOf(c);
      const toArrive = sh.stage === 'road' ? sh.daysLeft + (b.domestic ? 0 : 2 + b.seaDays) : sh.stage === 'port' ? sh.daysLeft + b.seaDays : sh.stage === 'sea' ? sh.daysLeft : 0;
      const eta = sh.payDay ?? s.day + toArrive + (c.terms === 'net30' ? 30 : 0);
      if (eta === d) { cash += contractValue(s, c) - c.advancePaid; notes.push(`${b.name} pays`); }
    }
    points.push({ day: d, cash, note: notes.join(', ') || undefined });
  }
  return points;
}
