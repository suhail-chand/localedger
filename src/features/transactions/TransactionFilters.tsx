import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { paiseToRupeesString, rupeesToPaise } from "@/domain/money";
import type {
  Account,
  Category,
  CategoryGroup,
  Label,
  Paise,
  Payee,
  PayeeGroup,
} from "@/domain/types";
import type { TransactionFilters as TransactionFilterState } from "@/domain/transactionView";

type TransactionFiltersProps = {
  filters: TransactionFilterState;
  accounts: Account[];
  categories: Category[];
  categoryGroups: CategoryGroup[];
  payees: Payee[];
  payeeGroups: PayeeGroup[];
  labels: Label[];
  onChange: (filters: TransactionFilterState) => void;
};

type MultiSelectGroup = {
  label: string;
  options: { id: string; label: string }[];
};

const typeOptions = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
];

const statusOptions = [
  { id: "uncleared", label: "Uncleared" },
  { id: "cleared", label: "Cleared" },
  { id: "reconciled", label: "Reconciled" },
];

export function TransactionFilters({
  filters,
  accounts,
  categories,
  categoryGroups,
  payees,
  payeeGroups,
  labels,
  onChange,
}: TransactionFiltersProps) {
  const [draftFilters, setDraftFilters] = useState(filters);
  const [minimumText, setMinimumText] = useState(amountText(filters.amountMin));
  const [maximumText, setMaximumText] = useState(amountText(filters.amountMax));
  const [minimumError, setMinimumError] = useState("");
  const [maximumError, setMaximumError] = useState("");

  useEffect(() => {
    setDraftFilters(filters);
    setMinimumText(amountText(filters.amountMin));
    setMaximumText(amountText(filters.amountMax));
  }, [filters]);

  function update(change: Partial<TransactionFilterState>): void {
    setDraftFilters((current) => ({ ...current, ...change }));
  }

  function toggle(
    field:
      | "types"
      | "accountIds"
      | "categoryIds"
      | "payeeIds"
      | "labelIds"
      | "statuses",
    id: string,
    checked: boolean,
  ): void {
    const selected = draftFilters[field] ?? [];
    const updated = checked
      ? [...selected, id]
      : selected.filter((item) => item !== id);
    update({ [field]: updated });
  }

  function commitAmount(field: "amountMin" | "amountMax", value: string): void {
    const setError = field === "amountMin" ? setMinimumError : setMaximumError;
    const parsed = parseAmountField(value, setError);
    if (parsed.valid) update({ [field]: parsed.value });
  }

  function applyFilters(): void {
    const minimum = parseAmountField(minimumText, setMinimumError);
    const maximum = parseAmountField(maximumText, setMaximumError);
    if (!minimum.valid || !maximum.valid) return;

    const appliedFilters = {
      ...draftFilters,
      amountMin: minimum.value,
      amountMax: maximum.value,
    };
    setDraftFilters(appliedFilters);
    onChange(appliedFilters);
  }

  function clearFilters(): void {
    const clearedFilters: TransactionFilterState = { sort: "newest" };
    setDraftFilters(clearedFilters);
    setMinimumText("");
    setMaximumText("");
    setMinimumError("");
    setMaximumError("");
    onChange(clearedFilters);
  }

  const accountsByType = groupOptions(
    accounts
      .filter((account) => !account.deleted)
      .map((account) => ({
        group: account.type.replaceAll("_", " "),
        id: account.id,
        label: account.name,
      })),
  );
  const categoriesByGroup = groupOptions(
    categories
      .filter((category) => !category.deleted)
      .map((category) => ({
        group:
          categoryGroups.find((item) => item.id === category.groupId)?.name ??
          "Other",
        id: category.id,
        label: category.name,
      })),
  );
  const payeesByGroup = groupOptions(
    payees
      .filter((payee) => !payee.deleted)
      .map((payee) => ({
        group: payee.groupId
          ? (payeeGroups.find((item) => item.id === payee.groupId)?.name ??
            "Ungrouped")
          : "Ungrouped",
        id: payee.id,
        label: payee.name,
      })),
  );

  return (
    <details className="mb-4 rounded-xl border border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Search and filters
      </summary>
      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">Search</span>
          <input
            type="search"
            value={draftFilters.search ?? ""}
            onChange={(event) => update({ search: event.target.value })}
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">From</span>
          <input
            type="datetime-local"
            value={draftFilters.from ?? ""}
            onChange={(event) => update({ from: event.target.value })}
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">To</span>
          <input
            type="datetime-local"
            value={draftFilters.to ?? ""}
            onChange={(event) => update({ to: event.target.value })}
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <MultiSelect
          label="Type"
          groups={[{ label: "Transaction type", options: typeOptions }]}
          selected={draftFilters.types ?? []}
          onToggle={(id, checked) => toggle("types", id, checked)}
        />
        <MultiSelect
          label="Account"
          groups={accountsByType}
          selected={draftFilters.accountIds ?? []}
          onToggle={(id, checked) => toggle("accountIds", id, checked)}
        />
        <MultiSelect
          label="Category"
          groups={categoriesByGroup}
          selected={draftFilters.categoryIds ?? []}
          onToggle={(id, checked) => toggle("categoryIds", id, checked)}
        />
        <MultiSelect
          label="Payer/payee"
          groups={payeesByGroup}
          selected={draftFilters.payeeIds ?? []}
          onToggle={(id, checked) => toggle("payeeIds", id, checked)}
        />
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">Minimum amount (INR)</span>
          <input
            type="text"
            inputMode="decimal"
            value={minimumText}
            onChange={(event) => {
              const value = event.target.value;
              if (!isAmountDraft(value)) return;
              setMinimumText(value);
              setMinimumError("");
            }}
            onBlur={() => commitAmount("amountMin", minimumText)}
            aria-invalid={Boolean(minimumError)}
            aria-describedby={minimumError ? "minimum-amount-error" : undefined}
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          />
          {minimumError ? (
            <span
              id="minimum-amount-error"
              role="alert"
              className="mt-1 block text-red-600"
            >
              {minimumError}
            </span>
          ) : null}
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">Maximum amount (INR)</span>
          <input
            type="text"
            inputMode="decimal"
            value={maximumText}
            onChange={(event) => {
              const value = event.target.value;
              if (!isAmountDraft(value)) return;
              setMaximumText(value);
              setMaximumError("");
            }}
            onBlur={() => commitAmount("amountMax", maximumText)}
            aria-invalid={Boolean(maximumError)}
            aria-describedby={maximumError ? "maximum-amount-error" : undefined}
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          />
          {maximumError ? (
            <span
              id="maximum-amount-error"
              role="alert"
              className="mt-1 block text-red-600"
            >
              {maximumError}
            </span>
          ) : null}
        </label>
        <MultiSelect
          label="Status"
          groups={[{ label: "Transaction status", options: statusOptions }]}
          selected={draftFilters.statuses ?? []}
          onToggle={(id, checked) => toggle("statuses", id, checked)}
        />
        <MultiSelect
          label="Labels"
          groups={[
            {
              label: "Labels",
              options: labels
                .filter((label) => !label.deleted)
                .map((label) => ({ id: label.id, label: label.name })),
            },
          ]}
          selected={draftFilters.labelIds ?? []}
          onToggle={(id, checked) => toggle("labelIds", id, checked)}
        />
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">Sort</span>
          <select
            value={draftFilters.sort ?? "newest"}
            onChange={(event) =>
              update({
                sort: event.target.value as TransactionFilterState["sort"],
              })
            }
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A-Z</option>
            <option value="amount-high">Highest amount</option>
            <option value="amount-low">Lowest amount</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
        <Button variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
        <Button onClick={applyFilters}>Apply</Button>
      </div>
    </details>
  );
}

function MultiSelect({
  label,
  groups,
  selected,
  onToggle,
}: {
  label: string;
  groups: MultiSelectGroup[];
  selected: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectedLabels = groups
    .flatMap((group) => group.options)
    .filter((option) => selected.includes(option.id))
    .map((option) => option.label);
  const selectionSummary =
    selectedLabels.length > 0
      ? `${selectedLabels.length} selected`
      : `All ${label.toLocaleLowerCase()}`;

  useEffect(() => {
    function dismissOutside(event: Event): void {
      const details = detailsRef.current;
      if (details?.open && !event.composedPath().includes(details)) {
        details.open = false;
      }
    }

    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("click", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("click", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  return (
    <div className="min-w-0 text-sm">
      <span className="mb-1 block">{label}</span>
      <details ref={detailsRef} className="relative min-w-0">
        <summary
          aria-label={`${label} filter`}
          className="flex min-h-11 min-w-0 cursor-pointer items-center justify-between rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
        >
          <span className="min-w-0 truncate text-gray-500">
            {selectionSummary}
          </span>
        </summary>
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-gray-300 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-950">
          {groups.length === 0 ||
          groups.every((group) => group.options.length === 0) ? (
            <p className="px-2 py-2 text-gray-500">No options available</p>
          ) : (
            groups
              .filter((group) => group.options.length > 0)
              .map((group) => (
                <fieldset key={group.label} className="mb-2 last:mb-0">
                  <legend className="px-2 py-1 font-medium capitalize text-gray-600 dark:text-gray-300">
                    {group.label}
                  </legend>
                  {group.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(option.id)}
                        onChange={(event) =>
                          onToggle(option.id, event.target.checked)
                        }
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
              ))
          )}
        </div>
      </details>
    </div>
  );
}

function groupOptions(
  options: { group: string; id: string; label: string }[],
): MultiSelectGroup[] {
  const groups = new Map<string, { id: string; label: string }[]>();
  for (const option of options) {
    const group = groups.get(option.group) ?? [];
    group.push({ id: option.id, label: option.label });
    groups.set(option.group, group);
  }
  return Array.from(groups, ([label, groupedOptions]) => ({
    label,
    options: groupedOptions,
  }));
}

function amountText(amount: Paise | undefined): string {
  return amount !== undefined ? paiseToRupeesString(amount) : "";
}

function parseAmountField(
  value: string,
  setError: (message: string) => void,
): { valid: true; value: Paise | undefined } | { valid: false } {
  const trimmed = value.trim();
  if (trimmed === "") {
    setError("");
    return { valid: true, value: undefined };
  }
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) {
    setError("Enter a non-negative amount with up to 2 decimal places.");
    return { valid: false };
  }

  try {
    setError("");
    return { valid: true, value: rupeesToPaise(trimmed) };
  } catch (caught) {
    setError(
      caught instanceof Error ? caught.message : "Enter a valid amount.",
    );
    return { valid: false };
  }
}

function isAmountDraft(value: string): boolean {
  return value === "" || /^(?:\d+(?:\.\d{0,2})?|\.\d{0,2})$/.test(value);
}
