import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeftRight, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { db } from "@/data/db";
import {
  createAccountRepository,
  createCategoryGroupRepository,
  createCategoryRepository,
  createLabelRepository,
  createPayeeGroupRepository,
  createPayeeRepository,
  createTransactionRepository,
} from "@/data/repositories";
import { calculateAccountBalancesAfterTransactions } from "@/domain/balances";
import type { Transaction } from "@/domain/types";
import { formatPaise } from "@/domain/money";
import {
  calculateFilteredTransactionTotals,
  filterAndSortTransactions,
  type TransactionFilters as TransactionFilterState,
} from "@/domain/transactionView";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionForm } from "./TransactionForm";
import { TransactionList } from "./TransactionList";

const accountRepository = createAccountRepository(db);
const categoryGroupRepository = createCategoryGroupRepository(db);
const categoryRepository = createCategoryRepository(db);
const payeeGroupRepository = createPayeeGroupRepository(db);
const payeeRepository = createPayeeRepository(db);
const labelRepository = createLabelRepository(db);
const transactionRepository = createTransactionRepository(db);

export function TransactionsScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction>();
  const [deleting, setDeleting] = useState<Transaction>();
  const [purging, setPurging] = useState<Transaction>();
  const [view, setView] = useState<"active" | "trash">("active");
  const [deleted, setDeleted] = useState<Transaction>();
  const [saveError, setSaveError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [filters, setFilters] = useState<TransactionFilterState>({
    sort: "newest",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const data = useLiveQuery(async () => {
    try {
      return {
        accounts: await accountRepository.list(),
        categoryGroups: await categoryGroupRepository.list(),
        categories: await categoryRepository.list(),
        payeeGroups: await payeeGroupRepository.list(),
        payees: await payeeRepository.list(),
        labels: await labelRepository.list(),
        transactions: await transactionRepository.list(),
        allTransactions: await transactionRepository.list(true),
        error: null,
      };
    } catch (caught) {
      return {
        accounts: null,
        categoryGroups: null,
        categories: null,
        payeeGroups: null,
        payees: null,
        labels: null,
        transactions: null,
        allTransactions: null,
        error:
          caught instanceof Error
            ? caught.message
            : "Unable to load transactions",
      };
    }
  }, []);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const categoryGroups = useMemo(() => data?.categoryGroups ?? [], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const payeeGroups = useMemo(() => data?.payeeGroups ?? [], [data]);
  const payees = useMemo(() => data?.payees ?? [], [data]);
  const labels = useMemo(() => data?.labels ?? [], [data]);
  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const trashedTransactions = useMemo(
    () =>
      data?.allTransactions?.filter((transaction) => transaction.deleted) ?? [],
    [data],
  );
  const visibleTransactions = useMemo(
    () => filterAndSortTransactions(transactions, filters),
    [transactions, filters],
  );

  function openCreate(): void {
    setEditing(undefined);
    setSaveError("");
    setSheetOpen(true);
  }

  function openEdit(transaction: Transaction): void {
    setEditing(transaction);
    setSaveError("");
    setSheetOpen(true);
  }

  async function saveTransaction(transaction: Transaction): Promise<void> {
    try {
      if (editing) {
        await transactionRepository.update(editing.id, transaction);
      } else {
        await transactionRepository.create(transaction);
      }
      setSheetOpen(false);
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Unable to save transaction",
      );
      throw caught;
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    setDeleteError("");
    try {
      await transactionRepository.softDelete(deleting.id);
      setDeleted(deleting);
      setDeleting(undefined);
      setSheetOpen(false);
    } catch (caught) {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "Unable to delete transaction",
      );
    }
  }

  async function undoDelete(): Promise<void> {
    if (!deleted) return;
    setDeleteError("");
    try {
      await transactionRepository.restore(deleted.id);
      setDeleted(undefined);
    } catch (caught) {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "Unable to restore transaction",
      );
    }
  }

  async function restoreTransaction(transaction: Transaction): Promise<void> {
    setDeleteError("");
    try {
      await transactionRepository.restore(transaction.id);
    } catch (caught) {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "Unable to restore transaction",
      );
    }
  }

  async function confirmPurge(): Promise<void> {
    if (!purging) return;
    setDeleteError("");
    try {
      await transactionRepository.purge(purging.id);
      setPurging(undefined);
    } catch (caught) {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "Unable to permanently delete transaction",
      );
    }
  }

  useEffect(() => {
    const visibleIds = new Set(
      visibleTransactions.map((transaction) => transaction.id),
    );
    setSelectedIds((current) => {
      const next = new Set(
        Array.from(current).filter((id) => visibleIds.has(id)),
      );
      return next.size === current.size &&
        Array.from(next).every((id) => current.has(id))
        ? current
        : next;
    });
  }, [visibleTransactions]);

  const filteredTotals = useMemo(
    () => calculateFilteredTransactionTotals(visibleTransactions),
    [visibleTransactions],
  );
  const selectedTransactions = useMemo(
    () =>
      visibleTransactions.filter((transaction) =>
        selectedIds.has(transaction.id),
      ),
    [visibleTransactions, selectedIds],
  );
  const selectedTotals = useMemo(
    () => calculateFilteredTransactionTotals(selectedTransactions),
    [selectedTransactions],
  );
  const hasActiveFilters = Boolean(
    filters.search?.trim() ||
    filters.from ||
    filters.to ||
    filters.types?.length ||
    filters.accountIds?.length ||
    filters.categoryIds?.length ||
    filters.payeeIds?.length ||
    filters.labelIds?.length ||
    filters.statuses?.length ||
    filters.amountMin !== undefined ||
    filters.amountMax !== undefined,
  );

  const balancesByTransaction = useMemo(
    () => calculateAccountBalancesAfterTransactions(accounts, transactions),
    [accounts, transactions],
  );

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">Transactions</h1>
        </div>
        <Button
          onClick={view === "active" ? openCreate : undefined}
          className="inline-flex shrink-0 items-center whitespace-nowrap"
          disabled={view === "trash"}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add transaction
        </Button>
      </div>

      <div
        className="mb-5 flex gap-2 border-b border-gray-200 dark:border-gray-800"
        role="tablist"
        aria-label="Transaction views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "active"}
          onClick={() => setView("active")}
          className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
            view === "active"
              ? "border-blue-600 text-blue-700 dark:text-blue-300"
              : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          }`}
        >
          Transactions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "trash"}
          onClick={() => setView("trash")}
          className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
            view === "trash"
              ? "border-blue-600 text-blue-700 dark:text-blue-300"
              : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          }`}
        >
          Trash
          {trashedTransactions.length > 0
            ? ` (${trashedTransactions.length})`
            : ""}
        </button>
      </div>

      {view === "trash" ? (
        <section aria-label="Trash">
          {deleteError ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {deleteError}
            </p>
          ) : null}
          {trashedTransactions.length === 0 ? (
            <EmptyState
              title="Trash is empty"
              description="Deleted transactions will appear here."
            />
          ) : (
            <div className="space-y-2">
              {trashedTransactions.map((transaction) => (
                <article
                  key={transaction.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">
                      {transaction.title}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {format(new Date(transaction.occurredAt), "PPP")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void restoreTransaction(transaction)}
                      className="inline-flex items-center"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Restore
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setPurging(transaction)}
                      className="inline-flex items-center"
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Delete permanently
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {saveError ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {saveError}
            </p>
          ) : null}

          {deleteError ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {deleteError}
            </p>
          ) : null}

          {deleted ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
              <span>“{deleted.title}” deleted</span>
              <Button variant="secondary" onClick={undoDelete} className="px-3">
                Undo
              </Button>
            </div>
          ) : null}

          {view === "active" && data !== undefined && !data.error ? (
            <>
              <TransactionFilters
                filters={filters}
                accounts={accounts}
                categories={categories}
                categoryGroups={categoryGroups}
                payees={payees}
                payeeGroups={payeeGroups}
                labels={labels}
                onChange={setFilters}
              />
              {transactions.length > 0 &&
              (hasActiveFilters || selectedIds.size > 0) ? (
                <div
                  aria-live="polite"
                  className="mb-5 grid gap-3 sm:grid-cols-2"
                >
                  <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Filtered total
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatPaise(filteredTotals.net)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {visibleTransactions.length}{" "}
                      {visibleTransactions.length === 1
                        ? "transaction"
                        : "transactions"}
                    </p>
                  </section>
                  {selectedIds.size > 0 ? (
                    <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Selected total
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {formatPaise(selectedTotals.net)}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {selectedIds.size}{" "}
                        {selectedIds.size === 1
                          ? "transaction"
                          : "transactions"}
                      </p>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {view === "active" ? (
            data === undefined ? (
              <p role="status">Loading transactions...</p>
            ) : data.error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              >
                Unable to load transactions: {data.error}
              </p>
            ) : transactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Add an expense, income or transfer."
                action={
                  <Button onClick={openCreate}>Create transaction</Button>
                }
              />
            ) : visibleTransactions.length === 0 ? (
              <EmptyState
                title="No matching transactions"
                description="Clear or change your search and filters."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setFilters({ sort: "newest" })}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <TransactionList
                transactions={visibleTransactions}
                accounts={accounts}
                categories={categories}
                payees={payees}
                labels={labels}
                balancesByTransaction={balancesByTransaction}
                selectedIds={selectedIds}
                sort={filters.sort ?? "newest"}
                onSelectionChange={(transaction, selected) =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (selected) {
                      next.add(transaction.id);
                    } else {
                      next.delete(transaction.id);
                    }
                    return next;
                  })
                }
                onEdit={openEdit}
              />
            )
          ) : null}

          <ConfirmDialog
            open={deleting !== undefined}
            title="Delete transaction?"
            description={
              deleting
                ? `Move “${deleting.title}” to trash? You can undo this immediately.`
                : ""
            }
            confirmLabel="Delete"
            onConfirm={confirmDelete}
            onCancel={() => setDeleting(undefined)}
          />

          <Sheet
            open={sheetOpen}
            title={editing ? "Edit transaction" : "Add transaction"}
            onClose={() => setSheetOpen(false)}
          >
            {sheetOpen ? (
              <TransactionForm
                editing={editing}
                accounts={accounts}
                categoryGroups={categoryGroups}
                categories={categories}
                payeeGroups={payeeGroups}
                payees={payees}
                labels={labels}
                onSubmit={saveTransaction}
                onDelete={(transaction) => {
                  setDeleteError("");
                  setDeleting(transaction);
                }}
              />
            ) : null}
          </Sheet>
        </>
      )}

      <ConfirmDialog
        open={purging !== undefined}
        title="Permanently delete transaction?"
        description={
          purging
            ? `This permanently removes “${purging.title}”. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete permanently"
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurging(undefined)}
      />
    </section>
  );
}
