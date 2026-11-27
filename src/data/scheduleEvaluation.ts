import type { LocaledgerDatabase } from "@/data/db";
import {
  assertOccurrenceReferencesAvailable,
  assertScheduleReferencesAvailable,
  assertTransactionReferencesAvailable,
} from "@/data/referenceIntegrity";
import {
  createDeterministicUuid,
  createOccurrenceRecordId,
  createScheduledTransactionId,
  toUtcIso,
} from "@/domain/ids";
import { occurrences } from "@/domain/recurrence";
import {
  occurrenceRecordSchema,
  scheduledTransactionSchema,
  transactionSchema,
} from "@/domain/schemas";
import type {
  OccurrenceRecord,
  ScheduledTransaction,
  Transaction,
} from "@/domain/types";

export interface ScheduleEvaluationOptions {
  now?: () => Date;
  timeZone?: string;
}

export interface ScheduleEvaluationResult {
  schedulesEvaluated: number;
  transactionsRecorded: number;
  occurrencesSkipped: number;
}

export class OccurrenceAlreadyRecordedError extends Error {
  constructor() {
    super("Occurrence has already been recorded");
    this.name = "OccurrenceAlreadyRecordedError";
  }
}

export class OccurrenceAlreadySkippedError extends Error {
  constructor() {
    super("Occurrence has already been skipped");
    this.name = "OccurrenceAlreadySkippedError";
  }
}

function deterministicSplitId(
  scheduleId: string,
  occurrenceAt: string,
  splitId: string,
): string {
  return createDeterministicUuid(
    `schedule-split:${scheduleId}:${occurrenceAt}:${splitId}`,
  );
}

function templateForOccurrence(
  schedule: ScheduledTransaction,
  occurrenceAt: string,
  template?: ScheduledTransaction["template"],
) {
  const source = template ?? schedule.template;
  return {
    ...source,
    occurredAt: occurrenceAt,
    splits: source.splits.map((split) => ({
      ...split,
      id: deterministicSplitId(schedule.id, occurrenceAt, split.id),
    })),
  };
}

export async function evaluateSchedules(
  database: LocaledgerDatabase,
  options: ScheduleEvaluationOptions = {},
): Promise<ScheduleEvaluationResult> {
  const now = options.now?.() ?? new Date();
  const nowIso = toUtcIso(now);
  const timeZone =
    options.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  let schedulesEvaluated = 0;
  let transactionsRecorded = 0;

  const schedules = await database.scheduledTransactions
    .filter((record) => !record.deleted && record.status === "active")
    .toArray();

  for (const rawSchedule of schedules) {
    const schedule = scheduledTransactionSchema.parse(rawSchedule);
    const from = schedule.lastEvaluatedAt ?? schedule.startAt;
    const dueAt = occurrences(
      {
        recurrence: schedule.recurrence,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        maxEntries: schedule.maxEntries,
      },
      { from, to: nowIso, timeZone },
    );

    await database.transaction(
      "rw",
      [
        database.accounts,
        database.categories,
        database.payees,
        database.labels,
        database.transactions,
        database.occurrenceRecords,
        database.scheduledTransactions,
      ],
      async () => {
        const current = scheduledTransactionSchema.parse(
          await database.scheduledTransactions.get(schedule.id),
        );
        if (current.deleted || current.status !== "active") {
          return;
        }

        schedulesEvaluated += 1;
        for (const occurrenceAt of dueAt) {
          if (!schedule.autoRecord) {
            continue;
          }

          const transactionId = createScheduledTransactionId(
            schedule.id,
            occurrenceAt,
          );
          const occurrenceId = createOccurrenceRecordId(
            schedule.id,
            occurrenceAt,
          );
          const existingOccurrence =
            await database.occurrenceRecords.get(occurrenceId);
          const existingTransaction =
            await database.transactions.get(transactionId);
          if (existingOccurrence || existingTransaction) {
            continue;
          }

          const template = templateForOccurrence(current, occurrenceAt);
          const transaction = transactionSchema.parse({
            ...template,
            id: transactionId,
            createdAt: nowIso,
            updatedAt: nowIso,
            deleted: false,
            scheduleId: current.id,
            occurrenceAt,
          });
          await assertTransactionReferencesAvailable(database, transaction);
          await database.transactions.put(transaction);

          const occurrence = occurrenceRecordSchema.parse({
            id: occurrenceId,
            scheduleId: current.id,
            occurrenceAt,
            outcome: "recorded",
            transactionId,
            createdAt: nowIso,
            updatedAt: nowIso,
            deleted: false,
          });
          await assertOccurrenceReferencesAvailable(database, occurrence);
          await database.occurrenceRecords.put(occurrence);
          transactionsRecorded += 1;
        }

        const completed =
          current.recurrence.type === "once" &&
          dueAt.includes(current.startAt) &&
          current.autoRecord;
        const occurrencesThroughNow = occurrences(
          {
            recurrence: current.recurrence,
            startAt: current.startAt,
            endAt: current.endAt,
            maxEntries: current.maxEntries,
          },
          { to: nowIso, timeZone },
        );
        const endedByLimit =
          current.maxEntries !== undefined &&
          occurrencesThroughNow.length >= current.maxEntries;
        const endedByDate =
          current.endAt !== undefined &&
          current.endAt <= nowIso &&
          dueAt.length > 0;

        const updated = scheduledTransactionSchema.parse({
          ...current,
          lastEvaluatedAt: nowIso,
          updatedAt: nowIso,
          status:
            completed || endedByLimit || endedByDate
              ? "completed"
              : current.status,
        });
        await assertScheduleReferencesAvailable(database, updated);
        await database.scheduledTransactions.put(updated);
      },
    );
  }

  return {
    schedulesEvaluated,
    transactionsRecorded,
    occurrencesSkipped: 0,
  };
}

export async function recordScheduleOccurrence(
  database: LocaledgerDatabase,
  scheduleId: string,
  occurrenceAt: string,
  templateOverride?: ScheduledTransaction["template"],
  options: ScheduleEvaluationOptions = {},
): Promise<{ transaction: Transaction; occurrence: OccurrenceRecord }> {
  const nowIso = toUtcIso(options.now?.() ?? new Date());
  const transactionId = createScheduledTransactionId(scheduleId, occurrenceAt);
  const occurrenceId = createOccurrenceRecordId(scheduleId, occurrenceAt);

  return database.transaction(
    "rw",
    [
      database.accounts,
      database.categories,
      database.payees,
      database.labels,
      database.transactions,
      database.occurrenceRecords,
      database.scheduledTransactions,
    ],
    async () => {
      const schedule = scheduledTransactionSchema.parse(
        await database.scheduledTransactions.get(scheduleId),
      );
      if (schedule.deleted) {
        throw new Error("Cannot record an occurrence for a deleted schedule");
      }

      const existing = await database.occurrenceRecords.get(occurrenceId);
      if (existing) {
        const occurrence = occurrenceRecordSchema.parse(existing);
        if (occurrence.outcome === "skipped") {
          throw new OccurrenceAlreadySkippedError();
        }
        const transaction = transactionSchema.parse(
          await database.transactions.get(transactionId),
        );
        return { transaction, occurrence };
      }

      const template = templateForOccurrence(
        schedule,
        occurrenceAt,
        templateOverride,
      );
      const transaction = transactionSchema.parse({
        ...template,
        id: transactionId,
        createdAt: nowIso,
        updatedAt: nowIso,
        deleted: false,
        scheduleId,
        occurrenceAt,
      });
      await assertTransactionReferencesAvailable(database, transaction);
      await database.transactions.put(transaction);

      const occurrence = occurrenceRecordSchema.parse({
        id: occurrenceId,
        scheduleId,
        occurrenceAt,
        outcome: "recorded",
        transactionId,
        createdAt: nowIso,
        updatedAt: nowIso,
        deleted: false,
      });
      await assertOccurrenceReferencesAvailable(database, occurrence);
      await database.occurrenceRecords.put(occurrence);
      if (schedule.recurrence.type === "once") {
        await database.scheduledTransactions.put(
          scheduledTransactionSchema.parse({
            ...schedule,
            status: "completed",
            lastEvaluatedAt: nowIso,
            updatedAt: nowIso,
          }),
        );
      }
      return { transaction, occurrence };
    },
  );
}

export async function skipScheduleOccurrence(
  database: LocaledgerDatabase,
  scheduleId: string,
  occurrenceAt: string,
  options: ScheduleEvaluationOptions = {},
): Promise<OccurrenceRecord> {
  const nowIso = toUtcIso(options.now?.() ?? new Date());
  const occurrenceId = createOccurrenceRecordId(scheduleId, occurrenceAt);

  return database.transaction(
    "rw",
    [
      database.scheduledTransactions,
      database.occurrenceRecords,
      database.transactions,
    ],
    async () => {
      const schedule = scheduledTransactionSchema.parse(
        await database.scheduledTransactions.get(scheduleId),
      );
      if (schedule.deleted) {
        throw new Error("Cannot skip an occurrence for a deleted schedule");
      }

      const existing = await database.occurrenceRecords.get(occurrenceId);
      if (existing) {
        const occurrence = occurrenceRecordSchema.parse(existing);
        if (occurrence.outcome === "recorded") {
          throw new OccurrenceAlreadyRecordedError();
        }
        return occurrence;
      }

      const occurrence = occurrenceRecordSchema.parse({
        id: occurrenceId,
        scheduleId,
        occurrenceAt,
        outcome: "skipped",
        createdAt: nowIso,
        updatedAt: nowIso,
        deleted: false,
      });
      await assertOccurrenceReferencesAvailable(database, occurrence);
      await database.occurrenceRecords.put(occurrence);
      if (schedule.recurrence.type === "once") {
        await database.scheduledTransactions.put(
          scheduledTransactionSchema.parse({
            ...schedule,
            status: "completed",
            lastEvaluatedAt: nowIso,
            updatedAt: nowIso,
          }),
        );
      }
      return occurrence;
    },
  );
}

export async function pauseSchedule(
  database: LocaledgerDatabase,
  scheduleId: string,
  options: ScheduleEvaluationOptions = {},
): Promise<ScheduledTransaction> {
  const nowIso = toUtcIso(options.now?.() ?? new Date());
  return updateScheduleStatus(database, scheduleId, "paused", nowIso);
}

export async function endSchedule(
  database: LocaledgerDatabase,
  scheduleId: string,
  options: ScheduleEvaluationOptions = {},
): Promise<ScheduledTransaction> {
  const nowIso = toUtcIso(options.now?.() ?? new Date());
  return updateScheduleStatus(database, scheduleId, "completed", nowIso);
}

async function updateScheduleStatus(
  database: LocaledgerDatabase,
  scheduleId: string,
  status: "paused" | "completed",
  nowIso: string,
): Promise<ScheduledTransaction> {
  return database.transaction(
    "rw",
    [
      database.scheduledTransactions,
      database.accounts,
      database.categories,
      database.payees,
      database.labels,
    ],
    async () => {
      const schedule = scheduledTransactionSchema.parse(
        await database.scheduledTransactions.get(scheduleId),
      );
      if (schedule.deleted) {
        throw new Error("Cannot update a deleted schedule");
      }
      const updated = scheduledTransactionSchema.parse({
        ...schedule,
        status,
        updatedAt: nowIso,
        endAt: status === "completed" ? nowIso : schedule.endAt,
      });
      await assertScheduleReferencesAvailable(database, updated);
      await database.scheduledTransactions.put(updated);
      return updated;
    },
  );
}
