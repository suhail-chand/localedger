import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleDollarSign, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { db } from "@/data/db";
import {
  AccountInUseError,
  createAccountRepository,
  createTransactionRepository,
} from "@/data/repositories";
import { calculateAccountBalances, calculateNetWorth } from "@/domain/balances";
import {
  formatPaise,
  paiseFromRupees,
  paiseToRupeesString,
} from "@/domain/money";
import { accountSchema } from "@/domain/schemas";
import type { Account, AccountType } from "@/domain/types";

const accountTypes: readonly AccountType[] = [
  "cash",
  "savings",
  "credit_card",
  "loan",
  "liability",
  "payable",
  "receivable",
  "investment",
  "other",
];

const accountTypeLabels: Record<AccountType, string> = {
  cash: "Cash",
  savings: "Savings / Bank",
  credit_card: "Credit Card",
  loan: "Loan",
  liability: "Liability",
  payable: "Payable",
  receivable: "Receivable",
  investment: "Investment",
  other: "Other",
};

type AccountFormValues = {
  name: string;
  type: AccountType;
  openingDate: string;
  startingBalance: string;
  note: string;
  hideFromTransactions: boolean;
  hideFromReports: boolean;
};

const accountRepository = createAccountRepository(db);
const transactionRepository = createTransactionRepository(db);

function localDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDateValue(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

function toFormValues(account?: Account): AccountFormValues {
  return account
    ? {
        name: account.name,
        type: account.type,
        openingDate: account.openingDate.slice(0, 10),
        startingBalance: paiseToRupeesString(account.startingBalance),
        note: account.note,
        hideFromTransactions: account.hideFromTransactions,
        hideFromReports: account.hideFromReports,
      }
    : {
        name: "",
        type: "cash",
        openingDate: localDateInputValue(),
        startingBalance: "0.00",
        note: "",
        hideFromTransactions: false,
        hideFromReports: false,
      };
}

export function AccountsScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();
  const [deleting, setDeleting] = useState<Account | undefined>();
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccountFormValues>(() => toFormValues());

  const data = useLiveQuery(
    async () => ({
      accounts: await accountRepository.list(),
      transactions: await transactionRepository.list(),
    }),
    [],
  );

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const balanceById = useMemo(
    () =>
      new Map(
        calculateAccountBalances(accounts, transactions).map((entry) => [
          entry.accountId,
          entry.balance,
        ]),
      ),
    [accounts, transactions],
  );

  function openCreate(): void {
    setEditing(undefined);
    setForm(toFormValues());
    setFormError("");
    setSheetOpen(true);
  }

  function openEdit(account: Account): void {
    setEditing(account);
    setForm(toFormValues(account));
    setFormError("");
    setSheetOpen(true);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const startingBalance = paiseFromRupees(form.startingBalance);
      const input = accountSchema.parse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        name: form.name,
        type: form.type,
        openingDate: utcDateValue(form.openingDate),
        startingBalance,
        currency: "INR",
        note: form.note,
        hideFromTransactions: form.hideFromTransactions,
        hideFromReports: form.hideFromReports,
      });
      if (editing) {
        await accountRepository.update(editing.id, input);
      } else {
        await accountRepository.create(input);
      }
      setSheetOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save account",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(): Promise<void> {
    if (!deleting) return;
    setDeleteError("");
    try {
      await accountRepository.softDelete(deleting.id);
      setDeleting(undefined);
    } catch (error) {
      setDeleteError(
        error instanceof AccountInUseError
          ? "This account has transactions or schedules. Hide or archive it instead."
          : error instanceof Error
            ? error.message
            : "Unable to delete account",
      );
    }
  }

  const netWorth = calculateNetWorth(accounts, transactions);

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CircleDollarSign className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">Accounts</h1>
        </div>
        <Button onClick={openCreate}>Add account</Button>
      </div>

      {data === undefined ? (
        <p role="status" className="text-sm text-gray-600">
          Loading accounts...
        </p>
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Create an account to track balances."
          action={<Button onClick={openCreate}>Create account</Button>}
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Net worth
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {formatPaise(netWorth)}
              </p>
            </div>
          </div>

          {accountTypes.map((type) => {
            const matching = accounts.filter((account) => account.type === type);
            if (matching.length === 0) return null;
            return (
              <section key={type} className="mb-6">
                <h2 className="mb-3 text-lg font-semibold">
                  {accountTypeLabels[type]}
                </h2>
                <div className="space-y-2">
                  {matching.map((account) => (
                    <article
                      key={account.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium">{account.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {account.hideFromReports
                            ? "Hidden from reports"
                            : "Included in balance sheet"}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatPaise(
                          balanceById.get(account.id) ??
                            account.startingBalance,
                          "none",
                        )}
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => openEdit(account)}
                        aria-label={`Edit ${account.name}`}
                        className="px-3"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          setDeleting(account);
                          setDeleteError("");
                        }}
                        aria-label={`Delete ${account.name}`}
                        className="px-3"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      <Sheet
        open={sheetOpen}
        title={editing ? "Edit account" : "Add account"}
        onClose={() => setSheetOpen(false)}
      >
        <form onSubmit={saveAccount} noValidate>
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="block text-sm font-medium">
              Type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as AccountType,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              >
                {accountTypes.map((type) => (
                  <option key={type} value={type}>
                    {accountTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Opening date
              <input
                type="date"
                value={form.openingDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    openingDate: event.target.value,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="block text-sm font-medium">
              Starting balance (INR)
              <input
                inputMode="decimal"
                value={form.startingBalance}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startingBalance: event.target.value,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="block text-sm font-medium">
              Note
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                className="mt-1 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.hideFromTransactions}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hideFromTransactions: event.target.checked,
                  }))
                }
              />
              Hide from transaction selection
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.hideFromReports}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hideFromReports: event.target.checked,
                  }))
                }
              />
              Hide from balance sheet and reports
            </label>
          </div>
          {formError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        open={deleting !== undefined}
        title={`Delete ${deleting?.name ?? "account"}?`}
        description={
          deleteError ||
          "This account will be moved to trash. It can only be deleted when it has no transactions or schedules."
        }
        confirmLabel="Delete"
        onConfirm={() => void deleteAccount()}
        onCancel={() => {
          setDeleting(undefined);
          setDeleteError("");
        }}
      />
    </section>
  );
}
