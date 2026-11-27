import { Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import type {
  Account,
  Category,
  CategoryGroup,
  Payee,
  PayeeGroup,
  Split,
} from "@/domain/types";

export type SplitFormValues = {
  id: string;
  type: Split["type"];
  amount: string;
  accountId: string;
  fromAccountId: string;
  toAccountId: string;
  categoryId: string;
  payeeId: string;
  note: string;
};

type TransactionSplitFieldsProps = {
  splits: SplitFormValues[];
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  payeeGroups: PayeeGroup[];
  payees: Payee[];
  onChange: (splits: SplitFormValues[]) => void;
};

export function TransactionSplitFields({
  splits,
  accounts,
  categoryGroups,
  categories,
  payeeGroups,
  payees,
  onChange,
}: TransactionSplitFieldsProps) {
  function accountGroupsForSelectedAccount(selectedAccountId: string) {
    return groupOptions(
      accounts.filter(
        (account) =>
          !account.hideFromTransactions || account.id === selectedAccountId,
      ),
      (account) => formatAccountType(account.type),
    );
  }

  function update(index: number, patch: Partial<SplitFormValues>): void {
    onChange(
      splits.map((split, splitIndex) =>
        splitIndex === index ? { ...split, ...patch } : split,
      ),
    );
  }

  function remove(index: number): void {
    onChange(splits.filter((_, splitIndex) => splitIndex !== index));
  }

  return (
    <div className="space-y-4">
      {splits.map((split, index) => (
        <fieldset
          key={split.id}
          className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        >
          <legend className="px-2 text-sm font-semibold">
            Split {index + 1}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Type
              <select
                value={split.type}
                onChange={(event) =>
                  update(index, {
                    type: event.target.value as Split["type"],
                  })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Amount (INR)
              <input
                inputMode="decimal"
                value={split.amount}
                onChange={(event) =>
                  update(index, { amount: event.target.value })
                }
                placeholder="e.g. 125.50 or (50+25)"
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            {split.type === "transfer" ? (
              <>
                <label className="block text-sm font-medium">
                  Account from
                  <select
                    value={split.fromAccountId}
                    onChange={(event) =>
                      update(index, { fromAccountId: event.target.value })
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">Select account</option>
                    {accountGroupsForSelectedAccount(split.fromAccountId).map(
                      ([group, groupedAccounts]) => (
                        <optgroup key={group} label={group}>
                          {groupedAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </optgroup>
                      ),
                    )}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Account to
                  <select
                    value={split.toAccountId}
                    onChange={(event) =>
                      update(index, { toAccountId: event.target.value })
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">Select account</option>
                    {accountGroupsForSelectedAccount(split.toAccountId).map(
                      ([group, groupedAccounts]) => (
                        <optgroup key={group} label={group}>
                          {groupedAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </optgroup>
                      ),
                    )}
                  </select>
                </label>
              </>
            ) : (
              <label className="block text-sm font-medium">
                {split.type === "expense"
                  ? "Debited account"
                  : "Credited account"}
                <select
                  value={split.accountId}
                  onChange={(event) =>
                    update(index, { accountId: event.target.value })
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select account</option>
                  {accountGroupsForSelectedAccount(split.accountId).map(
                    ([group, groupedAccounts]) => (
                      <optgroup key={group} label={group}>
                        {groupedAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </optgroup>
                    ),
                  )}
                </select>
              </label>
            )}

            {split.type !== "transfer" ? (
              <>
                <label className="block text-sm font-medium">
                  Category
                  <select
                    value={split.categoryId}
                    onChange={(event) =>
                      update(index, { categoryId: event.target.value })
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">No category</option>
                    {groupOptions(
                      categories.filter(
                        (category) => category.kind === split.type,
                      ),
                      (category) =>
                        categoryGroups.find(
                          (group) => group.id === category.groupId,
                        )?.name ?? "Other",
                    ).map(([group, groupedCategories]) => (
                      <optgroup key={group} label={group}>
                        {groupedCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {split.type === "expense" ? "Payee" : "Payer"}
                  <select
                    value={split.payeeId}
                    onChange={(event) =>
                      update(index, { payeeId: event.target.value })
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">None</option>
                    {groupOptions(payees, (payee) =>
                      payee.groupId
                        ? (payeeGroups.find(
                            (group) => group.id === payee.groupId,
                          )?.name ?? "Ungrouped")
                        : "Ungrouped",
                    ).map(([group, groupedPayees]) => (
                      <optgroup key={group} label={group}>
                        {groupedPayees.map((payee) => (
                          <option key={payee.id} value={payee.id}>
                            {payee.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label className="block text-sm font-medium sm:col-span-2">
              Split note
              <input
                value={split.note}
                onChange={(event) =>
                  update(index, { note: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
          {splits.length > 1 ? (
            <Button
              variant="danger"
              onClick={() => remove(index)}
              aria-label={`Remove split ${index + 1}`}
              className="mt-3 px-3"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </fieldset>
      ))}
    </div>
  );
}

function groupOptions<T>(
  options: readonly T[],
  getGroup: (option: T) => string,
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const option of options) {
    const label = getGroup(option);
    const group = groups.get(label) ?? [];
    group.push(option);
    groups.set(label, group);
  }
  return Array.from(groups);
}

function formatAccountType(type: Account["type"]): string {
  return type
    .split("_")
    .map((word) => `${word[0]?.toLocaleUpperCase()}${word.slice(1)}`)
    .join(" ");
}
