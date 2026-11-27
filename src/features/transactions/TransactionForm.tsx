import { useMemo, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import { evaluateCalculatorExpression } from "@/domain/calculator";
import {
  formatPaise,
  paiseToRupeesString,
  sumPaise,
  toPaise,
} from "@/domain/money";
import { transactionSchema } from "@/domain/schemas";
import type {
  Account,
  Category,
  CategoryGroup,
  Label,
  PayeeGroup,
  Payee,
  Split,
  Transaction,
} from "@/domain/types";
import {
  TransactionSplitFields,
  type SplitFormValues,
} from "./TransactionSplitFields";

type TransactionFormProps = {
  editing?: Transaction;
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  payeeGroups: PayeeGroup[];
  payees: Payee[];
  labels: Label[];
  onSubmit: (transaction: Transaction) => Promise<void>;
  onDelete: (transaction: Transaction) => void;
};

type FormValues = {
  title: string;
  occurredAt: string;
  splits: SplitFormValues[];
  labelIds: string[];
  status: Transaction["status"];
  note: string;
};

function localDateTimeValue(date = new Date()): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function toFormValues(
  transaction: Transaction | undefined,
  accountId: string,
): FormValues {
  if (!transaction) {
    return {
      title: "",
      occurredAt: localDateTimeValue(),
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: "",
          accountId,
          fromAccountId: "",
          toAccountId: "",
          categoryId: "",
          payeeId: "",
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    };
  }

  return {
    title: transaction.title,
    occurredAt: localDateTimeValue(new Date(transaction.occurredAt)),
    splits: transaction.splits.map((split) => ({
      id: split.id,
      type: split.type,
      amount: paiseToRupeesString(split.amount),
      accountId: split.type !== "transfer" ? split.accountId : "",
      fromAccountId: split.type === "transfer" ? split.fromAccountId : "",
      toAccountId: split.type === "transfer" ? split.toAccountId : "",
      categoryId:
        split.type !== "transfer" && split.categoryId ? split.categoryId : "",
      payeeId: split.type !== "transfer" && split.payeeId ? split.payeeId : "",
      note: split.note,
    })),
    labelIds: transaction.labelIds,
    status: transaction.status,
    note: transaction.note,
  };
}

export function TransactionForm({
  editing,
  accounts,
  categoryGroups,
  categories,
  payeeGroups,
  payees,
  labels,
  onSubmit,
  onDelete,
}: TransactionFormProps) {
  const availableAccounts = accounts.filter(
    (account) => !account.deleted && !account.hideFromTransactions,
  );
  const editingAccountIds = new Set(
    editing?.splits.flatMap((split) =>
      split.type === "transfer"
        ? [split.fromAccountId, split.toAccountId]
        : [split.accountId],
    ) ?? [],
  );
  const selectableAccounts = accounts.filter(
    (account) =>
      !account.deleted &&
      (!account.hideFromTransactions || editingAccountIds.has(account.id)),
  );
  const [form, setForm] = useState<FormValues>(() =>
    toFormValues(editing, availableAccounts[0]?.id ?? ""),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const total = useMemo(() => {
    try {
      const values = form.splits.map((split) => {
        const amount = evaluateCalculatorExpression(split.amount);
        if (amount <= 0) throw new RangeError("Amount must be positive");
        return split.type === "income"
          ? amount
          : split.type === "expense"
            ? toPaise(-amount)
            : toPaise(0);
      });
      return sumPaise(values);
    } catch {
      return toPaise(0);
    }
  }, [form.splits]);

  function addSplit(): void {
    setForm((current) => ({
      ...current,
      splits: [
        ...current.splits,
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: "",
          accountId: availableAccounts[0]?.id ?? "",
          fromAccountId: "",
          toAccountId: "",
          categoryId: "",
          payeeId: "",
          note: "",
        },
      ],
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");

    try {
      if (!form.title.trim()) throw new Error("Title is required");
      if (form.splits.length === 0)
        throw new Error("At least one split is required");

      const splits: Split[] = form.splits.map((split) => {
        const amount = evaluateCalculatorExpression(split.amount);
        if (amount <= 0)
          throw new Error("Split amount must be greater than zero");
        if (split.type === "transfer") {
          if (!split.fromAccountId || !split.toAccountId)
            throw new Error("Both transfer accounts are required");
          if (split.fromAccountId === split.toAccountId)
            throw new Error("Transfer accounts must be different");
          return {
            id: split.id,
            type: "transfer",
            amount,
            fromAccountId: split.fromAccountId,
            toAccountId: split.toAccountId,
            note: split.note,
          };
        }
        if (!split.accountId)
          throw new Error("A debited or credited account is required");
        return {
          id: split.id,
          type: split.type,
          amount,
          accountId: split.accountId,
          categoryId: split.categoryId || undefined,
          payeeId: split.payeeId || undefined,
          note: split.note,
        };
      });

      const occurredAt = new Date(form.occurredAt).toISOString();
      const now = new Date().toISOString();
      const transaction = transactionSchema.parse({
        id: editing?.id ?? crypto.randomUUID(),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        deleted: editing?.deleted ?? false,
        title: form.title,
        occurredAt,
        currency: "INR",
        splits,
        labelIds: form.labelIds,
        status: form.status,
        note: form.note,
        scheduleId: editing?.scheduleId,
        occurrenceAt: editing?.occurrenceAt,
      });
      await onSubmit(transaction);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save transaction",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          Title
          <input
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Date and time
          <input
            type="datetime-local"
            value={form.occurredAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                occurredAt: event.target.value,
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>

        <TransactionSplitFields
          splits={form.splits}
          accounts={selectableAccounts}
          categoryGroups={categoryGroups}
          categories={categories.filter((category) => !category.deleted)}
          payeeGroups={payeeGroups}
          payees={payees.filter((payee) => !payee.deleted)}
          onChange={(splits) => setForm((current) => ({ ...current, splits }))}
        />
        <Button variant="secondary" onClick={addSplit}>
          Add split
        </Button>

        <p className="text-sm font-medium">
          Total <span className="ml-2 text-lg">{formatPaise(total)}</span>
        </p>

        <fieldset>
          <legend className="text-sm font-medium">Labels</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {labels.map((label) => (
              <label
                key={label.id}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 dark:border-gray-700"
              >
                <input
                  type="checkbox"
                  checked={form.labelIds.includes(label.id)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      labelIds: event.target.checked
                        ? [...current.labelIds, label.id]
                        : current.labelIds.filter((id) => id !== label.id),
                    }))
                  }
                />
                <span>{label.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          Status
          <select
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as Transaction["status"],
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="cleared">Cleared</option>
            <option value="uncleared">Uncleared</option>
            <option value="reconciled">Reconciled</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Note
          <textarea
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
            rows={4}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save"}
        </Button>
        {editing ? (
          <Button
            variant="danger"
            onClick={() => onDelete(editing)}
            className="w-full"
          >
            <Trash2 className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Delete transaction
          </Button>
        ) : null}
      </div>
    </form>
  );
}
