import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  ensureDatabaseReady,
  type LocaledgerDatabase,
} from "@/data/db";
import {
  createAccountRepository,
  createScheduleRepository,
  createTransactionRepository,
} from "@/data/repositories";
import {
  OccurrenceAlreadySkippedError,
  endSchedule,
  evaluateSchedules,
  pauseSchedule,
  recordScheduleOccurrence,
  skipScheduleOccurrence,
} from "@/data/scheduleEvaluation";
import {
  createOccurrenceRecordId,
  createScheduledTransactionId,
} from "@/domain/ids";
import { toPaise } from "@/domain/money";

const databases: LocaledgerDatabase[] = [];

async function setupDatabase(name: string): Promise<LocaledgerDatabase> {
  const database = createDatabase(name);
  databases.push(database);
  await ensureDatabaseReady(database);
  return database;
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

async function createOneTimeSchedule(
  database: LocaledgerDatabase,
  options: { autoRecord: boolean },
) {
  const accounts = createAccountRepository(database);
  const schedules = createScheduleRepository(database);
  const account = await accounts.create({
    name: "Cash",
    type: "cash",
    openingDate: "2026-11-26T00:00:00.000Z",
    startingBalance: toPaise(0),
    currency: "INR",
    note: "",
    hideFromTransactions: false,
    hideFromReports: false,
  });

  return schedules.create({
    scheduleType: "one_time",
    template: {
      title: "Due rent",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          type: "expense",
          amount: toPaise(2500),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    },
    recurrence: { type: "once" },
    startAt: "2026-11-26T10:00:00.000Z",
    autoRecord: options.autoRecord,
    status: "active",
  });
}

describe("schedule evaluation", () => {
  it("auto-records a due occurrence once with deterministic IDs", async () => {
    const database = await setupDatabase("schedule-evaluation-idempotency");
    const schedule = await createOneTimeSchedule(database, {
      autoRecord: true,
    });
    const evaluationOptions = {
      now: () => new Date("2026-11-26T12:00:00.000Z"),
      timeZone: "UTC",
    };

    const first = await evaluateSchedules(database, evaluationOptions);
    const second = await evaluateSchedules(database, evaluationOptions);

    expect(first).toMatchObject({
      schedulesEvaluated: 1,
      transactionsRecorded: 1,
    });
    expect(second.transactionsRecorded).toBe(0);

    const transactionId = createScheduledTransactionId(
      schedule.id,
      schedule.startAt,
    );
    const occurrenceId = createOccurrenceRecordId(
      schedule.id,
      schedule.startAt,
    );
    expect(await database.transactions.get(transactionId)).toMatchObject({
      title: "Due rent",
      occurredAt: schedule.startAt,
      scheduleId: schedule.id,
      occurrenceAt: schedule.startAt,
    });
    expect(await database.occurrenceRecords.get(occurrenceId)).toMatchObject({
      outcome: "recorded",
      transactionId,
    });
    expect(
      (await database.scheduledTransactions.get(schedule.id))?.status,
    ).toBe("completed");
  });

  it("skips a non-auto occurrence once and rejects a later record", async () => {
    const database = await setupDatabase("schedule-evaluation-manual-skip");
    const schedule = await createOneTimeSchedule(database, {
      autoRecord: false,
    });

    const first = await skipScheduleOccurrence(
      database,
      schedule.id,
      schedule.startAt,
      { now: () => new Date("2026-11-26T12:00:00.000Z") },
    );
    const second = await skipScheduleOccurrence(
      database,
      schedule.id,
      schedule.startAt,
      { now: () => new Date("2026-11-26T13:00:00.000Z") },
    );

    expect(first.id).toBe(second.id);
    expect(first.outcome).toBe("skipped");
    expect(
      (await database.scheduledTransactions.get(schedule.id))?.status,
    ).toBe("completed");
    await expect(
      recordScheduleOccurrence(
        database,
        schedule.id,
        schedule.startAt,
        undefined,
        { now: () => new Date("2026-11-26T14:00:00.000Z") },
      ),
    ).rejects.toBeInstanceOf(OccurrenceAlreadySkippedError);
  });

  it("records a non-auto occurrence from the schedule template", async () => {
    const database = await setupDatabase("schedule-evaluation-manual-record");
    const schedule = await createOneTimeSchedule(database, {
      autoRecord: false,
    });
    const transactions = createTransactionRepository(database);

    const { transaction, occurrence } = await recordScheduleOccurrence(
      database,
      schedule.id,
      schedule.startAt,
      undefined,
      { now: () => new Date("2026-11-26T12:00:00.000Z") },
    );

    expect(occurrence.outcome).toBe("recorded");
    expect(await transactions.get(transaction.id)).toMatchObject({
      scheduleId: schedule.id,
      occurrenceAt: schedule.startAt,
    });
    expect(
      (await database.scheduledTransactions.get(schedule.id))?.status,
    ).toBe("completed");
  });

  it("pauses and ends schedules with updated UTC timestamps", async () => {
    const database = await setupDatabase("schedule-evaluation-status");
    const schedule = await createOneTimeSchedule(database, {
      autoRecord: false,
    });

    const paused = await pauseSchedule(database, schedule.id, {
      now: () => new Date("2026-11-26T12:00:00.000Z"),
    });
    expect(paused.status).toBe("paused");

    const ended = await endSchedule(database, schedule.id, {
      now: () => new Date("2026-11-26T13:00:00.000Z"),
    });
    expect(ended).toMatchObject({
      status: "completed",
      endAt: "2026-11-26T13:00:00.000Z",
      updatedAt: "2026-11-26T13:00:00.000Z",
    });
  });
});
