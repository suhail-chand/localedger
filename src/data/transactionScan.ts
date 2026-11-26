import type { LocaledgerDatabase } from "@/data/db";
import { transactionSchema } from "@/domain/schemas";
import type { Transaction } from "@/domain/types";

export class TransactionDataCorruptionError extends Error {
  constructor() {
    super("Corrupt transaction data prevents this operation");
    this.name = "TransactionDataCorruptionError";
  }
}

export interface TransactionScanOptions {
  corruptionError?: () => Error;
  shouldEarlyExit?: (transaction: Transaction) => boolean;
}

export async function scanTransactions(
  database: LocaledgerDatabase,
  visitor: (transaction: Transaction) => void | Promise<void>,
  options: TransactionScanOptions = {},
): Promise<void> {
  const records = await database.transactions.toArray();
  const transactions: Transaction[] = [];

  for (const record of records) {
    const parsed = transactionSchema.safeParse(record);
    if (!parsed.success) {
      throw options.corruptionError?.() ?? new TransactionDataCorruptionError();
    }
    transactions.push(parsed.data);
  }

  for (const transaction of transactions) {
    await visitor(transaction);
    if (options.shouldEarlyExit?.(transaction)) {
      return;
    }
  }
}
