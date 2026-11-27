import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/Button";
import { formatPaise } from "@/domain/money";
import type { AccountBalance } from "@/domain/balances";
import type {
  Account,
  Category,
  Label,
  Payee,
  Transaction,
} from "@/domain/types";
import {
  groupTransactionsByLocalDate,
  type TransactionSort,
} from "@/domain/transactionView";
import { TransactionRow } from "./TransactionRow";

type TransactionListProps = {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  labels: Label[];
  balancesByTransaction: ReadonlyMap<string, readonly AccountBalance[]>;
  selectedIds: ReadonlySet<string>;
  sort: TransactionSort;
  onSelectionChange: (transaction: Transaction, selected: boolean) => void;
  onEdit: (transaction: Transaction) => void;
};

const INITIAL_TRANSACTION_COUNT = 100;
const TRANSACTION_BATCH_SIZE = 100;

export function TransactionList({
  transactions,
  accounts,
  categories,
  payees,
  labels,
  balancesByTransaction,
  selectedIds,
  sort,
  onSelectionChange,
  onEdit,
}: TransactionListProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const [visibleCounts, setVisibleCounts] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  const monthKeys = useMemo(
    () =>
      Array.from(
        new Set(
          transactions.map((transaction) =>
            format(new Date(transaction.occurredAt), "yyyy-MM"),
          ),
        ),
      ).sort(),
    [transactions],
  );
  const selectedMonthIndex = selectedMonth
    ? monthKeys.indexOf(selectedMonth)
    : -1;
  const activeMonthIndex =
    selectedMonthIndex >= 0 ? selectedMonthIndex : monthKeys.length - 1;
  const activeMonthKey = monthKeys[activeMonthIndex];
  const monthTransactions = useMemo(
    () =>
      activeMonthKey
        ? transactions.filter(
            (transaction) =>
              format(new Date(transaction.occurredAt), "yyyy-MM") ===
              activeMonthKey,
          )
        : [],
    [activeMonthKey, transactions],
  );
  const groups = useMemo(
    () => groupTransactionsByLocalDate(monthTransactions, sort),
    [monthTransactions, sort],
  );
  const visibleCount = activeMonthKey
    ? (visibleCounts.get(activeMonthKey) ?? INITIAL_TRANSACTION_COUNT)
    : 0;
  const hasMoreTransactions = monthTransactions.length > visibleCount;
  const monthDate = activeMonthKey
    ? new Date(`${activeMonthKey}-15T12:00:00`)
    : undefined;
  let remainingTransactions = visibleCount;
  const visibleGroups = groups
    .map((group) => {
      const visibleTransactions = group.transactions.slice(
        0,
        remainingTransactions,
      );
      remainingTransactions -= visibleTransactions.length;
      return { group, transactions: visibleTransactions };
    })
    .filter(
      ({ transactions: visibleTransactions }) => visibleTransactions.length > 0,
    );

  function selectMonth(index: number): void {
    const monthKey = monthKeys[index];
    if (monthKey) setSelectedMonth(monthKey);
  }

  return (
    <div>
      {monthDate ? (
        <div className="mb-5 flex items-center gap-2">
          <Button
            variant="secondary"
            aria-label="Older month"
            disabled={activeMonthIndex <= 0}
            onClick={() => selectMonth(activeMonthIndex - 1)}
            className="shrink-0 px-3"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 text-center font-semibold"
          >
            {format(monthDate, "MMMM yyyy")}
          </p>
          <Button
            variant="secondary"
            aria-label="Newer month"
            disabled={activeMonthIndex >= monthKeys.length - 1}
            onClick={() => selectMonth(activeMonthIndex + 1)}
            className="shrink-0 px-3"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className="space-y-5">
        {visibleGroups.map(({ group, transactions: groupTransactions }) => (
          <section
            key={group.dateKey}
            aria-label={format(
              new Date(`${group.dateKey}T12:00:00`),
              "MMMM d, yyyy",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">
                {format(new Date(`${group.dateKey}T12:00:00`), "EEEE, MMMM d")}
              </h2>
              <p className="text-sm font-medium">{formatPaise(group.total)}</p>
            </div>
            <div className="space-y-2">
              {groupTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  accounts={accounts}
                  categories={categories}
                  payees={payees}
                  labels={labels}
                  balances={balancesByTransaction.get(transaction.id) ?? []}
                  selected={selectedIds.has(transaction.id)}
                  onSelectionChange={onSelectionChange}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {hasMoreTransactions ? (
        <Button
          variant="secondary"
          onClick={() => {
            if (!activeMonthKey) return;
            setVisibleCounts((current) => {
              const next = new Map(current);
              next.set(activeMonthKey, visibleCount + TRANSACTION_BATCH_SIZE);
              return next;
            });
          }}
          className="mt-5 w-full"
        >
          Show more transactions
        </Button>
      ) : null}
    </div>
  );
}
