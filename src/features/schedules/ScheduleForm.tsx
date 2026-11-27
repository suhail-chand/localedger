import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { evaluateCalculatorExpression } from "@/domain/calculator";
import { paiseToRupeesString } from "@/domain/money";
import { scheduledTransactionSchema } from "@/domain/schemas";
import type {
  Account,
  Category,
  CategoryGroup,
  Label,
  Payee,
  PayeeGroup,
  ScheduledTransaction,
  Split,
} from "@/domain/types";
import type { EmiInstalment } from "@/domain/emi";
import {
  TransactionSplitFields,
  type SplitFormValues,
} from "@/features/transactions/TransactionSplitFields";
import { occurrences } from "@/domain/recurrence";
import { EmiReview } from "./EmiReview";

type EmiApproval = {
  principalAccountId: string;
  loanAccountId: string;
  breakdown: EmiInstalment[];
  dueDates: string[];
};

type ScheduleFormProps = {
  editing?: ScheduledTransaction;
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  payeeGroups: PayeeGroup[];
  payees: Payee[];
  labels: Label[];
  onSubmit: (schedule: ScheduledTransaction) => Promise<void>;
  onEmiSubmit: (
    title: string,
    startAt: string,
    autoRecord: boolean,
    approval: EmiApproval,
  ) => Promise<void>;
  onDelete: (schedule: ScheduledTransaction) => void;
};

function localDateTimeValue(date = new Date()): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function splitToForm(split: Split): SplitFormValues {
  return {
    id: split.id,
    type: split.type,
    amount: paiseToRupeesString(split.amount),
    accountId: split.type !== "transfer" ? (split.accountId ?? "") : "",
    fromAccountId: split.type === "transfer" ? (split.fromAccountId ?? "") : "",
    toAccountId: split.type === "transfer" ? (split.toAccountId ?? "") : "",
    categoryId: split.type !== "transfer" ? (split.categoryId ?? "") : "",
    payeeId: split.type !== "transfer" ? (split.payeeId ?? "") : "",
    note: split.note,
  };
}

export function ScheduleForm({
  editing,
  accounts,
  categoryGroups,
  categories,
  payeeGroups,
  payees,
  labels,
  onSubmit,
  onEmiSubmit,
  onDelete,
}: ScheduleFormProps) {
  const availableAccounts = accounts.filter(
    (account) => !account.deleted && !account.hideFromTransactions,
  );
  const [scheduleType, setScheduleType] = useState<
    ScheduledTransaction["scheduleType"]
  >(editing?.scheduleType ?? "recurring");
  const [title, setTitle] = useState(editing?.template.title ?? "");
  const [startAt, setStartAt] = useState(
    localDateTimeValue(editing ? new Date(editing.startAt) : new Date()),
  );
  const [every, setEvery] = useState(
    editing?.recurrence.type === "every" ? String(editing.recurrence.n) : "1",
  );
  const [unit, setUnit] = useState<"day" | "week" | "month" | "year">(
    editing?.recurrence.type === "every" ? editing.recurrence.unit : "month",
  );
  const [maxEntries, setMaxEntries] = useState(
    editing?.maxEntries
      ? String(editing.maxEntries)
      : editing?.endAt && editing.recurrence.type === "every"
        ? String(
            occurrences(
              {
                recurrence: editing.recurrence,
                startAt: editing.startAt,
                endAt: editing.endAt,
              },
              { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            ).length,
          )
        : "",
  );
  const [autoRecord, setAutoRecord] = useState(editing?.autoRecord ?? false);
  const [splits, setSplits] = useState<SplitFormValues[]>(
    editing?.template.splits.map(splitToForm) ?? [
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
  );
  const [labelIds, setLabelIds] = useState(editing?.template.labelIds ?? []);
  const [status, setStatus] = useState(editing?.template.status ?? "cleared");
  const [note, setNote] = useState(editing?.template.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectableAccounts = useMemo(
    () => accounts.filter((account) => !account.deleted),
    [accounts],
  );
  const parsedStartAt = new Date(startAt);
  const startAtIso = Number.isNaN(parsedStartAt.getTime())
    ? undefined
    : parsedStartAt.toISOString();

  function addSplit(): void {
    setSplits((current) => [
      ...current,
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
    ]);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (Number.isNaN(new Date(startAt).getTime())) {
        throw new Error("A valid start date and time is required");
      }
      if (scheduleType === "recurring") {
        const entryCount = Number(maxEntries);
        const recurrenceInterval = Number(every);
        if (!Number.isInteger(entryCount) || entryCount < 1) {
          throw new Error("Number of entries must be a positive whole number");
        }
        if (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1) {
          throw new Error(
            "Recurrence interval must be a positive whole number",
          );
        }
      }
      const parsedSplits: Split[] = splits.map((split) => {
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
      const now = new Date().toISOString();
      const recurrence =
        scheduleType === "one_time"
          ? { type: "once" as const }
          : {
              type: "every" as const,
              n: Math.max(1, Number(every)),
              unit,
            };
      const schedule = scheduledTransactionSchema.parse({
        id: editing?.id ?? crypto.randomUUID(),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        deleted: editing?.deleted ?? false,
        scheduleType,
        template: {
          title,
          occurredAt: new Date(startAt).toISOString(),
          currency: "INR",
          splits: parsedSplits,
          labelIds,
          status,
          note,
        },
        recurrence,
        startAt: new Date(startAt).toISOString(),
        maxEntries:
          scheduleType === "recurring" ? Number(maxEntries) : undefined,
        autoRecord,
        status: editing?.status ?? "active",
        lastEvaluatedAt: editing?.lastEvaluatedAt,
        seriesId: editing?.seriesId,
        emi: editing?.emi,
      });
      await onSubmit(schedule);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save schedule",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="block text-sm font-medium">
          Schedule type
          <select
            value={scheduleType}
            onChange={(event) =>
              setScheduleType(
                event.target.value as ScheduledTransaction["scheduleType"],
              )
            }
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="one_time">One-time</option>
            <option value="recurring">Recurring</option>
            <option value="emi">EMI</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Start date and time
          <input
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        {scheduleType === "emi" ? (
          <EmiReview
            accounts={selectableAccounts}
            startAt={startAtIso}
            onApprove={(approval) => {
              if (!startAtIso) {
                throw new Error("A valid start date and time is required");
              }
              return onEmiSubmit(title, startAtIso, autoRecord, approval);
            }}
          />
        ) : (
          <>
            {scheduleType === "recurring" ? (
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <label className="text-sm font-medium">
                  Every
                  <input
                    type="number"
                    min="1"
                    value={every}
                    onChange={(event) => setEvery(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
                  />
                </label>
                <label className="text-sm font-medium">
                  Unit
                  <select
                    value={unit}
                    onChange={(event) =>
                      setUnit(event.target.value as typeof unit)
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option value="day">Days</option>
                    <option value="week">Weeks</option>
                    <option value="month">Months</option>
                    <option value="year">Years</option>
                  </select>
                </label>
              </div>
            ) : null}
            {scheduleType === "recurring" ? (
              <label className="block text-sm font-medium">
                Number of entries
                <input
                  type="number"
                  min="1"
                  required
                  value={maxEntries}
                  onChange={(event) => setMaxEntries(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
                />
              </label>
            ) : null}
            <TransactionSplitFields
              splits={splits}
              accounts={selectableAccounts}
              categoryGroups={categoryGroups}
              categories={categories.filter((category) => !category.deleted)}
              payeeGroups={payeeGroups}
              payees={payees.filter((payee) => !payee.deleted)}
              onChange={setSplits}
            />
            <Button type="button" variant="secondary" onClick={addSplit}>
              Add split
            </Button>
            <fieldset>
              <legend className="text-sm font-medium">Labels</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {labels
                  .filter((label) => !label.deleted)
                  .map((label) => (
                    <label
                      key={label.id}
                      className="flex min-h-11 items-center gap-2 rounded-lg border px-3 dark:border-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={labelIds.includes(label.id)}
                        onChange={(event) =>
                          setLabelIds((current) =>
                            event.target.checked
                              ? [...current, label.id]
                              : current.filter((id) => id !== label.id),
                          )
                        }
                      />
                      {label.name}
                    </label>
                  ))}
              </div>
            </fieldset>
            <label className="block text-sm font-medium">
              Template status
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as typeof status)
                }
                className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="cleared">Cleared</option>
                <option value="uncleared">Uncleared</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
          </>
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={autoRecord}
            onChange={(event) => setAutoRecord(event.target.checked)}
          />
          Automatically record at due time
        </label>
        {scheduleType !== "emi" ? (
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save schedule"}
          </Button>
        ) : null}
        {editing ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => onDelete(editing)}
            className="w-full"
          >
            <Trash2 className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Delete schedule
          </Button>
        ) : null}
      </div>
    </form>
  );
}
