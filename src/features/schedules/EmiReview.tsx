import { format } from "date-fns";
import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  calculateEmi,
  validateEditableEmiBreakdown,
  type EmiInstalment,
} from "@/domain/emi";
import {
  formatInr,
  paiseToRupeesString,
  rupeesToPaise,
  sumPaise,
} from "@/domain/money";
import { occurrences } from "@/domain/recurrence";
import type { Account } from "@/domain/types";

type EmiReviewProps = {
  accounts: Account[];
  startAt?: string;
  onApprove: (values: {
    principalAccountId: string;
    loanAccountId: string;
    breakdown: EmiInstalment[];
    dueDates: string[];
  }) => Promise<void>;
};

export function EmiReview({ accounts, startAt, onApprove }: EmiReviewProps) {
  const [principal, setPrincipal] = useState("");
  const [annualRate, setAnnualRate] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [tenure, setTenure] = useState("12");
  const [interestType, setInterestType] = useState<"flat" | "reducing">(
    "reducing",
  );
  const [principalAccountId, setPrincipalAccountId] = useState("");
  const [loanAccountId, setLoanAccountId] = useState("");
  const [breakdown, setBreakdown] = useState<EmiInstalment[]>([]);
  const [error, setError] = useState("");
  const [confirmMismatch, setConfirmMismatch] = useState(false);

  const plan = useMemo(() => {
    try {
      const principalPaise = rupeesToPaise(principal || "0");
      const tenureNumber = Number(tenure);
      if (
        principalPaise <= 0 ||
        !Number.isInteger(tenureNumber) ||
        tenureNumber < 1
      ) {
        return null;
      }
      return calculateEmi({
        principal: principalPaise,
        annualInterestRateBps: Math.round(Number(annualRate) * 100),
        taxRateBps: Math.round(Number(taxRate) * 100),
        tenure: tenureNumber,
        interestType,
      });
    } catch {
      return null;
    }
  }, [principal, annualRate, taxRate, tenure, interestType]);
  const dueDates = useMemo(() => {
    if (!startAt || !plan) return [];
    return occurrences({
      recurrence: { type: "every", n: 1, unit: "month" },
      startAt,
      maxEntries: plan.instalments.length,
    });
  }, [plan, startAt]);

  function loadBreakdown(): void {
    setError("");
    if (!plan || dueDates.length !== plan.instalments.length) {
      setError(
        "Enter a valid start date, principal, interest rate, tax rate and tenure.",
      );
      return;
    }
    setBreakdown(plan.instalments.map((row) => ({ ...row })));
  }

  function updateRow(
    index: number,
    field: "principal" | "interest" | "tax",
    value: string,
  ): void {
    setBreakdown((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? (() => {
              try {
                const paise = rupeesToPaise(value);
                const next = { ...row, [field]: paise };
                return {
                  ...next,
                  total: sumPaise([next.principal, next.interest, next.tax]),
                };
              } catch {
                return row;
              }
            })()
          : row,
      ),
    );
  }

  async function approve(): Promise<void> {
    setError("");
    if (
      !plan ||
      !principalAccountId ||
      !loanAccountId ||
      principalAccountId === loanAccountId ||
      dueDates.length !== breakdown.length
    ) {
      setError("Select two different accounts and calculate a breakdown.");
      return;
    }
    const validation = validateEditableEmiBreakdown(
      breakdown,
      {
        principal: rupeesToPaise(principal),
        annualInterestRateBps: Math.round(Number(annualRate) * 100),
        taxRateBps: Math.round(Number(taxRate) * 100),
        tenure: Number(tenure),
        interestType,
      },
      plan,
    );
    if (!validation.valid) {
      setConfirmMismatch(true);
      return;
    }
    try {
      await onApprove({
        principalAccountId,
        loanAccountId,
        breakdown,
        dueDates,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create EMI series",
      );
    }
  }

  async function approveMismatch(): Promise<void> {
    setConfirmMismatch(false);
    try {
      await onApprove({
        principalAccountId,
        loanAccountId,
        breakdown,
        dueDates,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create EMI series",
      );
    }
  }

  const totals = {
    principal: sumPaise(breakdown.map((row) => row.principal)),
    interest: sumPaise(breakdown.map((row) => row.interest)),
    tax: sumPaise(breakdown.map((row) => row.tax)),
    payment: sumPaise(breakdown.map((row) => row.total)),
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Principal (INR)
          <input
            inputMode="decimal"
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="text-sm">
          Annual interest (%)
          <input
            inputMode="decimal"
            value={annualRate}
            onChange={(event) => setAnnualRate(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="text-sm">
          Tax on interest (%)
          <input
            inputMode="decimal"
            value={taxRate}
            onChange={(event) => setTaxRate(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="text-sm">
          Tenure (instalments)
          <input
            type="number"
            min="1"
            value={tenure}
            onChange={(event) => setTenure(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="text-sm">
          Interest type
          <select
            value={interestType}
            onChange={(event) =>
              setInterestType(event.target.value as "flat" | "reducing")
            }
            className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="reducing">Reducing balance</option>
            <option value="flat">Fixed/flat</option>
          </select>
        </label>
        <AccountSelect
          label="Loan payment account"
          accounts={accounts.filter(
            (account) =>
              account.id !== loanAccountId || account.id === principalAccountId,
          )}
          value={principalAccountId}
          onChange={setPrincipalAccountId}
        />
        <AccountSelect
          label="Loan account"
          accounts={accounts.filter(
            (account) =>
              account.id !== principalAccountId || account.id === loanAccountId,
          )}
          value={loanAccountId}
          onChange={setLoanAccountId}
        />
      </div>
      <Button variant="secondary" onClick={loadBreakdown}>
        Calculate breakdown
      </Button>
      {breakdown.length > 0 ? (
        <div className="space-y-3">
          {breakdown.map((row, index) => (
            <fieldset
              key={row.index}
              className="grid gap-3 rounded-lg border p-3 text-sm dark:border-gray-700 sm:grid-cols-3"
            >
              <legend>Instalment {index + 1}</legend>
              <p className="sm:col-span-3">
                Date:{" "}
                {dueDates[index]
                  ? format(new Date(dueDates[index]), "PPP")
                  : "Not available"}
              </p>
              {(["principal", "interest", "tax"] as const).map((field) => (
                <label key={field}>
                  {field[0]?.toUpperCase()}
                  {field.slice(1)}
                  <input
                    inputMode="decimal"
                    value={paiseToRupeesString(row[field])}
                    onChange={(event) =>
                      updateRow(index, field, event.target.value)
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border px-2 dark:border-gray-700 dark:bg-gray-950"
                  />
                </label>
              ))}
              <p className="font-medium sm:col-span-3">
                Entry total: {formatInr(row.total, "none")}
              </p>
            </fieldset>
          ))}
          <dl className="grid gap-2 rounded-lg border p-3 text-sm dark:border-gray-700 sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt>Total principal</dt>
              <dd>{formatInr(totals.principal, "none")}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Total interest</dt>
              <dd>{formatInr(totals.interest, "none")}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Total tax</dt>
              <dd>{formatInr(totals.tax, "none")}</dd>
            </div>
            <div className="flex justify-between gap-2 font-semibold">
              <dt>Total payable</dt>
              <dd>{formatInr(totals.payment, "none")}</dd>
            </div>
          </dl>
          <Button onClick={() => void approve()} className="w-full">
            Approve EMI series
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmMismatch}
        title="Principal breakdown changed"
        description="The edited instalments no longer reconcile to the calculated principal. Do you want to approve it anyway?"
        confirmLabel="Approve anyway"
        onCancel={() => setConfirmMismatch(false)}
        onConfirm={() => void approveMismatch()}
      />
    </div>
  );
}

function AccountSelect({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}) {
  const grouped = new Map<string, Account[]>();
  for (const account of accounts.filter((item) => !item.deleted)) {
    const group = account.type
      .split("_")
      .map((word) => `${word[0]?.toLocaleUpperCase()}${word.slice(1)}`)
      .join(" ");
    grouped.set(group, [...(grouped.get(group) ?? []), account]);
  }

  return (
    <label className="text-sm">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border px-3 dark:border-gray-700 dark:bg-gray-950"
      >
        <option value="">Select account</option>
        {Array.from(grouped, ([group, accountsInGroup]) => (
          <optgroup key={group} label={group}>
            {accountsInGroup.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
