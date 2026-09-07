/**
 * Turns the local ledger into a compact Turkish text snapshot the model reads
 * before answering. This is the whole reason the assistant is worth having:
 * without it we'd just be a worse ChatGPT.
 *
 * Reads are synchronous (`.all()`), so a snapshot is built fresh on every send —
 * the model never answers from stale numbers.
 */

import { KASA_LABELS } from '@/constants/labels';
import { monthRange, today } from '@/db/dates';
import { getCurrentUserId } from '@/auth/current-user';
import { allAccountsQuery } from '@/db/queries/accounts';
import { allMembershipsQuery } from '@/db/queries/members';
import { accessibleAccounts } from '@/utils/accessible-accounts';
import { categoriesQuery } from '@/db/queries/categories';
import { accountContactMovementsQuery, contactsWithBalanceQuery } from '@/db/queries/contacts';
import {
  categoryBreakdownQuery,
  kasaBalancesQuery,
  monthlyKasaFlowQuery,
  monthlyTotalsQuery,
} from '@/db/queries/reports';
import { accountTransactionsQuery } from '@/db/queries/transactions';
import { formatTRY } from '@/utils/money';
import { kasaBalances, kasaTotal, type AccountOpening } from '@/utils/kasa-balances';
import { computeOverdue, outstandingLots } from '@/utils/overdue';

/** Caps so a busy shop's ledger can't blow up the prompt. Truncation is always
 *  stated in the text — a silently shortened list would make the model claim
 *  totals it never saw. */
const MAX_CONTACTS = 40;
const MAX_TRANSACTIONS = 40;

/** Build the data block for `accountId`, or a stand-in when no account exists. */
export function buildContext(accountId: string | null): string {
  const accounts = accessibleAccounts(
    allAccountsQuery().all(),
    allMembershipsQuery().all(),
    getCurrentUserId(),
  );
  if (accounts.length === 0) return 'Kullanıcının henüz hiç hesabı yok.';

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const day = today();
  const { start, end } = monthRange(day);

  const sections = [
    `BUGÜNÜN TARİHİ: ${day}`,
    accountsSection(accounts, account.id),
    balanceSection(account.name, account),
    categoriesSection(account.id),
    contactsSection(account.id),
    monthSection(account.id, start, end),
    transactionsSection(account.id),
  ];

  return sections.join('\n\n');
}

function accountsSection(
  accounts: { id: string; name: string; cachedBalance: number }[],
  activeId: string,
): string {
  const total = accounts.reduce((sum, a) => sum + a.cachedBalance, 0);
  const lines = accounts.map(
    (a) => `- ${a.name}: ${formatTRY(a.cachedBalance)}${a.id === activeId ? '  <- açık olan hesap' : ''}`,
  );
  return `HESAPLAR (toplam varlık ${formatTRY(total)}):\n${lines.join('\n')}`;
}

/**
 * The total plus where it sits. Without the breakdown the assistant answers
 * "bankada ne kadar var?" with the whole balance, which is confidently wrong.
 */
function balanceSection(name: string, account: AccountOpening & { id: string }): string {
  const balances = kasaBalances(kasaBalancesQuery(account.id).all(), account);
  const lines = balances.map((b) => `  - ${KASA_LABELS[b.kasaType]}: ${formatTRY(b.total)}`);

  return [
    `AÇIK HESAP: ${name}`,
    `Kasa bakiyesi: ${formatTRY(kasaTotal(balances))}`,
    `Kasa kırılımı:\n${lines.join('\n')}`,
  ].join('\n');
}

/**
 * The exact category names, split by direction.
 *
 * Needed because a proposed transaction is saved against an existing category —
 * an invented name fails at save time. Listing them is what keeps the model from
 * inventing "Nakliye Giderleri" when the account has "Nakliye".
 */
function categoriesSection(accountId: string): string {
  const all = categoriesQuery(accountId).all();
  const names = (kind: 'income' | 'expense') =>
    all
      .filter((c) => c.kind === kind)
      .map((c) => c.name)
      .join(', ') || 'yok';

  return [
    'KATEGORİLER (sadece bunlar kullanılabilir, yenisini uydurma):',
    `Gelir: ${names('income')}`,
    `Gider: ${names('expense')}`,
  ].join('\n');
}

function contactsSection(accountId: string): string {
  const all = contactsWithBalanceQuery(accountId).all();
  if (all.length === 0) return 'CARİLER: kayıtlı cari yok.';

  const owesUs = all.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const weOwe = all.filter((c) => c.balance < 0).sort((a, b) => a.balance - b.balance);

  const totalOwedToUs = owesUs.reduce((sum, c) => sum + c.balance, 0);
  const totalWeOwe = weOwe.reduce((sum, c) => sum + Math.abs(c.balance), 0);

  // Grouped once from a single query so "kim gecikmiş?" can be answered without
  // the model guessing from dates it cannot see.
  const movements = accountContactMovementsQuery(accountId).all();
  const byContact = new Map<string, { txDate: string; contactAmount: number }[]>();
  for (const m of movements) {
    if (!m.contactId) continue;
    const rows = byContact.get(m.contactId) ?? [];
    rows.push({ txDate: m.txDate, contactAmount: m.contactAmount });
    byContact.set(m.contactId, rows);
  }
  const day = today();

  const shown = [...owesUs, ...weOwe].slice(0, MAX_CONTACTS);
  const lines = shown.map((c) => {
    const role = c.balance > 0 ? 'bize borçlu' : 'bizden alacaklı';
    const phone = c.phone ? `, tel ${c.phone}` : '';
    const overdue =
      c.balance > 0
        ? computeOverdue(
            outstandingLots(c.openingBalance, byContact.get(c.id) ?? []),
            c.paymentTermDays,
            day,
          )
        : null;
    const late =
      overdue && overdue.amount > 0
        ? `, VADESİ GEÇMİŞ: ${formatTRY(overdue.amount)} (${overdue.daysLate} gün)`
        : '';
    return `- ${c.name}: ${formatTRY(Math.abs(c.balance))} ${role}${phone}${late}`;
  });

  const hidden = owesUs.length + weOwe.length - shown.length;
  const note = hidden > 0 ? `\n(${hidden} cari daha var, listeye sığmadı)` : '';
  const settled = all.length - owesUs.length - weOwe.length;

  return [
    `CARİLER — toplam alacak ${formatTRY(totalOwedToUs)}, toplam borç ${formatTRY(totalWeOwe)},`,
    `${settled} cari kapalı (bakiyesi sıfır):`,
    lines.join('\n') + note,
  ].join(' ');
}

function monthSection(accountId: string, start: string, end: string): string {
  const totals = monthlyTotalsQuery(accountId, start, end).all();
  const income = totals.find((t) => t.kind === 'income')?.total ?? 0;
  const expense = totals.find((t) => t.kind === 'expense')?.total ?? 0;

  const breakdown = categoryBreakdownQuery(accountId, 'expense', start, end).all();
  const categories = breakdown.length
    ? breakdown.map((c) => `  - ${c.name}: ${formatTRY(c.total)}`).join('\n')
    : '  - bu ay harcama yok';

  // Kasa hareketi ayrıca gönderiliyor: yukarıdaki gelir/gider yalnızca
  // KATEGORİLİ işlemleri sayıyor. Bir kişiye yapılan nakit ödemenin kategorisi
  // olmaz, dolayısıyla oradan görünmez — ama para kasadan çıkmıştır. İkisini de
  // vermezsek model "hiç harcaman yok" der, kasa 745 ₺ hafiflemişken.
  const flow = monthlyKasaFlowQuery(accountId, start, end).all()[0];
  const inflow = Number(flow?.inflow ?? 0);
  const outflow = Number(flow?.outflow ?? 0);

  return [
    `BU AY (${start} – ${end}):`,
    `Kategorili gelir: ${formatTRY(income)}`,
    `Kategorili gider: ${formatTRY(expense)}`,
    `Fark: ${formatTRY(income - expense)}`,
    `Kasaya giren toplam: ${formatTRY(inflow)}`,
    `Kasadan çıkan toplam: ${formatTRY(outflow)}`,
    `(Kasadan çıkan, kategorili giderden büyükse aradaki fark kişilere yapılan`,
    ` ödemeler ya da kasalar arası aktarımdır — kategorisi olmadığı için gidere sayılmaz.)`,
    `Kategoriye göre gider:\n${categories}`,
  ].join('\n');
}

function transactionsSection(accountId: string): string {
  const rows = accountTransactionsQuery(accountId).all();
  if (rows.length === 0) return 'SON İŞLEMLER: henüz hareket yok.';

  const shown = rows.slice(0, MAX_TRANSACTIONS);
  const lines = shown.map((r) => {
    const parts = [r.description, r.categoryName, r.contactName].filter(Boolean).join(' · ');
    // A transfer is stored with direction 'out'; printing it with a minus would
    // make the model report a day of moving cash to the bank as a loss.
    if (r.kind === 'transfer') {
      const to = r.toKasaType ? KASA_LABELS[r.toKasaType] : '?';
      const from = r.kasaType ? KASA_LABELS[r.kasaType] : '?';
      return `- ${r.txDate}   ${formatTRY(r.amount)}  TRANSFER ${from} → ${to} (gelir/gider değil)  ${parts || ''}`.trimEnd();
    }
    const sign = r.direction === 'in' ? '+' : '-';
    const kasa = r.kasaType ? KASA_LABELS[r.kasaType] : 'Veresiye';
    return `- ${r.txDate}  ${sign}${formatTRY(r.amount)}  ${kasa}  ${parts || '(açıklama yok)'}`;
  });

  const hidden = rows.length - shown.length;
  const note = hidden > 0 ? `\n(daha eski ${hidden} işlem var, listeye sığmadı)` : '';
  return `SON İŞLEMLER (yeniden eskiye, ${shown.length} tane):\n${lines.join('\n')}${note}`;
}
