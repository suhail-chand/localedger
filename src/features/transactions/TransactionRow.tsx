import {
  Briefcase,
  Car,
  Ellipsis,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Percent,
  Receipt,
  ShoppingBasket,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { formatPaise } from "@/domain/money";
import type { Paise } from "@/domain/types";
import type {
  Account,
  Category,
  Label,
  Payee,
  Transaction,
} from "@/domain/types";
import {
  getTransactionAccountDisplay,
  getTransactionAmount,
  getTransactionAmountMode,
  getTransactionPartyDisplay,
  getTransactionPrimaryCategory,
} from "@/domain/transactionView";

const iconByKey = new Map<string, LucideIcon>([
  ["ellipsis", Ellipsis],
  ["utensils", Utensils],
  ["basket", ShoppingBasket],
  ["home", Home],
  ["car", Car],
  ["heart", HeartPulse],
  ["education", GraduationCap],
  ["gift", Gift],
  ["briefcase", Briefcase],
  ["percent", Percent],
  ["receipt", Receipt],
]);

type TransactionRowProps = {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  labels: Label[];
  balances: readonly { accountId: string; balance: Paise }[];
  selected: boolean;
  onSelectionChange: (transaction: Transaction, selected: boolean) => void;
  onEdit: (transaction: Transaction) => void;
};

export function TransactionRow({
  transaction,
  accounts,
  categories,
  payees,
  labels,
  balances,
  selected,
  onSelectionChange,
  onEdit,
}: TransactionRowProps) {
  const party = getTransactionPartyDisplay(transaction, payees);
  const account = getTransactionAccountDisplay(transaction, accounts, balances);
  const category = getTransactionPrimaryCategory(transaction, categories);
  const CategoryIcon = category ? iconByKey.get(category.icon) : undefined;
  const transactionLabels = labels.filter((label) =>
    transaction.labelIds.includes(label.id),
  );

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-gray-800">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) =>
              onSelectionChange(transaction, event.target.checked)
            }
            aria-label={`Select ${transaction.title}`}
            className="absolute right-0 top-0 z-10 h-4 w-4 cursor-pointer accent-blue-600"
          />
          {CategoryIcon ? (
            <CategoryIcon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Ellipsis className="h-5 w-5" aria-hidden="true" />
          )}
        </label>
        <button
          type="button"
          onClick={() => onEdit(transaction)}
          aria-label={`Open ${transaction.title}`}
          className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="min-w-0">
            <h3 className="truncate font-medium">{transaction.title}</h3>
            <p className="truncate text-sm text-gray-600 dark:text-gray-300">
              {party.name}
            </p>
            {transactionLabels.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1" aria-label="Labels">
                {transactionLabels.map((label) => (
                  <span
                    key={label.id}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${label.color}20`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="min-w-0 text-right">
            <p className="font-semibold">
              {formatPaise(
                getTransactionAmount(transaction),
                getTransactionAmountMode(transaction),
              )}
            </p>
            <p className="max-w-36 truncate text-sm text-gray-600 dark:text-gray-300">
              {account.name}
              {account.balance !== undefined
                ? ` (${formatPaise(account.balance)})`
                : ""}
            </p>
          </div>
        </button>
      </div>
    </article>
  );
}
