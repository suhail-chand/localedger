import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, Plus } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Sheet } from "@/components/Sheet";
import { db } from "@/data/db";
import {
  createAccountRepository,
  createCategoryGroupRepository,
  createCategoryRepository,
  createLabelRepository,
  createOccurrenceRepository,
  createPayeeGroupRepository,
  createPayeeRepository,
  createScheduleRepository,
  createSettingsRepository,
  endSchedule,
  pauseSchedule,
  recordScheduleOccurrence,
  skipScheduleOccurrence,
} from "@/data/repositories";
import { SEED_IDS } from "@/data/seed";
import type { EmiInstalment } from "@/domain/emi";
import { buildIcsCalendar } from "@/domain/ics";
import { toUtcIso } from "@/domain/ids";
import type { ScheduledTransaction, Split, Transaction } from "@/domain/types";
import { TransactionForm } from "@/features/transactions/TransactionForm";
import { deliverIcsFile, type IcsDeliveryResult } from "./icsDelivery";
import { ScheduleFilters, type ScheduleFilterState } from "./ScheduleFilters";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleList } from "./ScheduleList";

const scheduleRepository = createScheduleRepository(db);
const occurrenceRepository = createOccurrenceRepository(db);
const accountRepository = createAccountRepository(db);
const categoryRepository = createCategoryRepository(db);
const categoryGroupRepository = createCategoryGroupRepository(db);
const payeeRepository = createPayeeRepository(db);
const payeeGroupRepository = createPayeeGroupRepository(db);
const labelRepository = createLabelRepository(db);
const settingsRepository = createSettingsRepository(db);

export function SchedulesScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTransaction>();
  const [deleting, setDeleting] = useState<ScheduledTransaction>();
  const [recordEditing, setRecordEditing] = useState<{
    schedule: ScheduledTransaction;
    occurrenceAt: string;
  }>();
  const [view, setView] = useState<"active" | "trash">("active");
  const [filters, setFilters] = useState<ScheduleFilterState>({
    sort: "next_due",
  });
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [delivery, setDelivery] = useState<IcsDeliveryResult | null>(null);

  const data = useLiveQuery(async () => {
    try {
      return {
        schedules: await scheduleRepository.list(),
        allSchedules: await scheduleRepository.list(true),
        occurrences: await occurrenceRepository.list(),
        accounts: await accountRepository.list(),
        categories: await categoryRepository.list(),
        categoryGroups: await categoryGroupRepository.list(),
        payees: await payeeRepository.list(),
        payeeGroups: await payeeGroupRepository.list(),
        labels: await labelRepository.list(),
        settings: await settingsRepository.list(),
        error: null,
      };
    } catch (caught) {
      return {
        schedules: null,
        allSchedules: null,
        occurrences: null,
        accounts: null,
        categories: null,
        categoryGroups: null,
        payees: null,
        payeeGroups: null,
        labels: null,
        settings: null,
        error:
          caught instanceof Error ? caught.message : "Unable to load schedules",
      };
    }
  }, []);

  const schedules = useMemo(() => data?.schedules ?? [], [data]);
  const allSchedules = useMemo(() => data?.allSchedules ?? [], [data]);
  const occurrences = useMemo(() => data?.occurrences ?? [], [data]);
  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const categoryGroups = useMemo(() => data?.categoryGroups ?? [], [data]);
  const payees = useMemo(() => data?.payees ?? [], [data]);
  const payeeGroups = useMemo(() => data?.payeeGroups ?? [], [data]);
  const labels = useMemo(() => data?.labels ?? [], [data]);
  const leadMinutes =
    data?.settings?.find((setting) => !setting.deleted)?.reminderLeadMinutes ??
    1440;
  const trashedSchedules = allSchedules.filter((schedule) => schedule.deleted);

  function notifySchedulesChanged(): void {
    window.dispatchEvent(new Event("localedger:schedules-changed"));
  }

  function openCreate(): void {
    setEditing(undefined);
    setSaveError("");
    setSheetOpen(true);
  }

  function openEdit(schedule: ScheduledTransaction): void {
    setEditing(schedule);
    setSaveError("");
    setSheetOpen(true);
  }

  async function saveSchedule(schedule: ScheduledTransaction): Promise<void> {
    try {
      if (editing) await scheduleRepository.update(editing.id, schedule);
      else await scheduleRepository.create(schedule);
      notifySchedulesChanged();
      setSheetOpen(false);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to save schedule";
      setSaveError(message);
      throw caught;
    }
  }

  async function createEmiSeries(
    title: string,
    startAt: string,
    autoRecord: boolean,
    approval: {
      principalAccountId: string;
      loanAccountId: string;
      breakdown: EmiInstalment[];
    },
  ): Promise<void> {
    try {
      const seriesId = crypto.randomUUID();
      const firstStart = new Date(startAt);
      for (let index = 0; index < approval.breakdown.length; index += 1) {
        const row = approval.breakdown[index];
        if (!row) continue;
        const occurrenceDate = new Date(firstStart);
        occurrenceDate.setMonth(firstStart.getMonth() + index);
        const occurrenceAt = toUtcIso(occurrenceDate);
        const emiSplits: Split[] = [
          {
            id: crypto.randomUUID(),
            type: "transfer",
            amount: row.principal,
            fromAccountId: approval.principalAccountId,
            toAccountId: approval.loanAccountId,
            note: "Principal",
          },
          ...(row.interest > 0
            ? [
                {
                  id: crypto.randomUUID(),
                  type: "expense" as const,
                  amount: row.interest,
                  accountId: approval.principalAccountId,
                  categoryId: SEED_IDS.interest,
                  note: "Interest",
                },
              ]
            : []),
          ...(row.tax > 0
            ? [
                {
                  id: crypto.randomUUID(),
                  type: "expense" as const,
                  amount: row.tax,
                  accountId: approval.principalAccountId,
                  categoryId: SEED_IDS.tax,
                  note: "Tax",
                },
              ]
            : []),
        ];
        await scheduleRepository.create({
          scheduleType: "emi",
          template: {
            title: `${title} - Instalment ${index + 1}`,
            occurredAt: occurrenceAt,
            currency: "INR",
            splits: emiSplits,
            labelIds: [],
            status: "cleared",
            note: "",
          },
          recurrence: { type: "once" },
          startAt: occurrenceAt,
          maxEntries: 1,
          autoRecord,
          status: "active",
          seriesId,
          emi: {
            index,
            principal: row.principal,
            interest: row.interest,
            tax: row.tax,
          },
        });
      }
      notifySchedulesChanged();
      setSheetOpen(false);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Unable to create EMI series";
      setSaveError(message);
      throw caught;
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    try {
      await scheduleRepository.softDelete(deleting.id);
      notifySchedulesChanged();
      setDeleting(undefined);
      setSheetOpen(false);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Unable to delete schedule",
      );
    }
  }

  async function recordOccurrence(
    schedule: ScheduledTransaction,
    occurrenceAt: string,
  ): Promise<void> {
    setActionError("");
    try {
      await recordScheduleOccurrence(db, schedule.id, occurrenceAt);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Unable to record occurrence",
      );
    }
  }

  async function skipOccurrence(
    schedule: ScheduledTransaction,
    occurrenceAt: string,
  ): Promise<void> {
    setActionError("");
    try {
      await skipScheduleOccurrence(db, schedule.id, occurrenceAt);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Unable to skip occurrence",
      );
    }
  }

  function syntheticEditingTransaction(): Transaction | undefined {
    if (!recordEditing) return undefined;
    const now = toUtcIso(new Date());
    return {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      title: recordEditing.schedule.template.title,
      occurredAt: recordEditing.occurrenceAt,
      currency: "INR",
      splits: recordEditing.schedule.template.splits,
      labelIds: recordEditing.schedule.template.labelIds,
      status: recordEditing.schedule.template.status,
      note: recordEditing.schedule.template.note,
      scheduleId: recordEditing.schedule.id,
      occurrenceAt: recordEditing.occurrenceAt,
    };
  }

  async function saveEditedOccurrence(transaction: Transaction): Promise<void> {
    if (!recordEditing) return;
    await recordScheduleOccurrence(
      db,
      recordEditing.schedule.id,
      recordEditing.occurrenceAt,
      {
        title: transaction.title,
        occurredAt: transaction.occurredAt,
        currency: "INR",
        splits: transaction.splits,
        labelIds: transaction.labelIds,
        status: transaction.status,
        note: transaction.note,
      },
    );
    setRecordEditing(undefined);
  }

  async function exportReminders(): Promise<void> {
    setActionError("");
    try {
      const calendar = buildIcsCalendar(schedules, {
        dtstamp: toUtcIso(new Date()),
        leadMinutes,
        appUrl: window.location.href,
      });
      setDelivery(await deliverIcsFile(calendar));
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Could not export reminders.",
      );
    }
  }

  const monthEndLimitation = schedules.some(
    (schedule) =>
      schedule.recurrence.type === "every" &&
      schedule.recurrence.unit === "month" &&
      new Date(schedule.startAt).getDate() >= 29,
  );

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      {saveError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {saveError}
        </p>
      ) : null}
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      ) : null}
      {data?.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {data.error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Scheduled transactions</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Plan upcoming entries and EMI series.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("active")}
          className="min-h-11 rounded-lg px-4 text-sm font-medium"
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => setView("trash")}
          className="min-h-11 rounded-lg px-4 text-sm font-medium"
        >
          Trash ({trashedSchedules.length})
        </button>
      </div>

      {monthEndLimitation ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Month-end starts on day 29-31 have limitations in some calendar apps.
        </p>
      ) : null}

      {view === "active" ? (
        <>
          <ScheduleFilters filters={filters} onChange={setFilters} />
          <ScheduleList
            schedules={schedules}
            occurrences={occurrences}
            filters={filters}
            onEdit={openEdit}
            onPause={(schedule) =>
              void pauseSchedule(db, schedule.id)
                .then(() => notifySchedulesChanged())
                .catch((caught) =>
                  setActionError(
                    caught instanceof Error
                      ? caught.message
                      : "Unable to pause",
                  ),
                )
            }
            onEnd={(schedule) =>
              void endSchedule(db, schedule.id)
                .then(() => notifySchedulesChanged())
                .catch((caught) =>
                  setActionError(
                    caught instanceof Error ? caught.message : "Unable to end",
                  ),
                )
            }
            onRecord={(schedule, occurrenceAt) =>
              void recordOccurrence(schedule, occurrenceAt)
            }
            onEditRecord={(schedule, occurrenceAt) =>
              setRecordEditing({ schedule, occurrenceAt })
            }
            onSkip={(schedule, occurrenceAt) =>
              void skipOccurrence(schedule, occurrenceAt)
            }
            onExport={function (): void {
              throw new Error("Function not implemented.");
            }}
          />
        </>
      ) : (
        <ul className="space-y-2">
          {trashedSchedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <span>{schedule.template.title}</span>
              <Button
                variant="secondary"
                onClick={() => {
                  void scheduleRepository
                    .restore(schedule.id)
                    .then(() => {
                      notifySchedulesChanged();
                    })
                    .catch((caught) => {
                      setActionError(
                        caught instanceof Error
                          ? caught.message
                          : "Unable to restore schedule",
                      );
                    });
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-lg border p-4 dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Reminders are repeatable snapshots for your calendar.
        </p>
        {delivery ? (
          <p role="status" className="text-sm text-green-700">
            {delivery === "shared"
              ? "Reminder calendar shared."
              : "Reminder calendar downloaded."}
          </p>
        ) : null}
        <Button
          onClick={() => void exportReminders()}
          disabled={schedules.length === 0}
        >
          <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
          Export .ics
        </Button>
      </div>

      <Sheet
        open={sheetOpen}
        title={editing ? "Edit schedule" : "New schedule"}
        onClose={() => setSheetOpen(false)}
      >
        {saveError ? (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {saveError}
          </p>
        ) : null}
        <ScheduleForm
          editing={editing}
          accounts={accounts}
          categories={categories}
          categoryGroups={categoryGroups}
          payees={payees}
          payeeGroups={payeeGroups}
          labels={labels}
          onSubmit={saveSchedule}
          onEmiSubmit={createEmiSeries}
          onDelete={(schedule) => setDeleting(schedule)}
        />
      </Sheet>

      <Sheet
        open={Boolean(recordEditing)}
        title="Edit and record occurrence"
        onClose={() => setRecordEditing(undefined)}
      >
        {recordEditing ? (
          <TransactionForm
            editing={syntheticEditingTransaction()}
            accounts={accounts}
            categories={categories}
            categoryGroups={categoryGroups}
            payees={payees}
            payeeGroups={payeeGroups}
            labels={labels}
            onSubmit={saveEditedOccurrence}
            onDelete={() => undefined}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete schedule?"
        description="This moves the schedule to trash. Its occurrence history remains recoverable."
        confirmLabel="Delete schedule"
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
