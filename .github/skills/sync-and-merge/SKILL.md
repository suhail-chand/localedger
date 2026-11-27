---
name: sync-and-merge
description: Implement or change Localedger's Google Drive sync, including appDataFolder file layout, per-record merge, tombstones, manifest commit, snapshots, first-sync flow, and recovery. Use for anything under src/sync or affecting synced data.
---

# Sync and merge

## Drive layout (`appDataFolder`, scope `drive.appdata`)

- `manifest.json`: `{ schemaVersion, files: { name: { driveFileId, revision, updatedAt } }, devices: { deviceId: { lastSyncAt } } }`. Written **last**; it is the commit marker.
- Entity files: `accounts.json`, `categories.json` (with groups), `payees.json` (with groups), `labels.json`, `schedules.json`, `settings.json`.
- Transactions: `transactions-YYYY-MM.json`, sharded by the **UTC month of `createdAt`** (immutable), so a record never moves between shards when its date is edited.
- `backups/`: timestamped snapshots (keep the last N, configurable, default 10).
- Each file is `{ schemaVersion, records: Record[] }` and validated with Zod on read.

## Merge (`src/domain/merge.ts`, pure and heavily tested)

`mergeRecords(local, remote)` per ID: higher `updatedAt` wins; tie → compare `deviceId` lexicographically (deterministic). A tombstone (`deleted: true`) is a normal record: it wins if newer. Never resurrect a deleted record from an older non-deleted copy. The result is identical regardless of argument order (test commutativity, associativity, idempotence).

## Sync algorithm

1. Ensure auth (token in memory). If unavailable: stay local, show "Sign in to resume sync".
2. Download `manifest.json` (create it if missing, first sync).
3. For each changed file (compare revision or `modifiedTime` to last-seen): download, validate, merge into IndexedDB (inside a Dexie transaction).
4. Compute local changes since last push; upload changed files. **Conditional write:** re-check remote revision just before upload; if it changed, loop to step 3 (bounded retries).
5. Write `manifest.json` last. Update device-local last-sync info.
6. Snapshot policy: before first sync and before any destructive step, take a snapshot. Also snapshot at most once per day on regular sync.

## First connection

- Remote empty → upload local.
- Remote has data and local is empty → pull.
- Both have data → show a merge summary (counts per entity, newest/oldest dates) and require confirmation; snapshot both sides first; merge per record. Never overwrite either side wholesale.

## Failure handling

Typed errors: `AuthError`, `NetworkError`, `QuotaError`, `ConflictError`, `CorruptDataError`, `SchemaTooNewError`. On `CorruptDataError` or `SchemaTooNewError`: stop, do not write, explain, and offer restore from the latest valid snapshot or an app update. Sync never blocks the UI; status states: synced, syncing, offline, pending changes, sign-in needed, error.

## Tests (against an in-memory fake Drive)

Two devices editing different records; same record edited on both (newer wins); delete vs edit conflict; offline edits then reconnect; token expiry mid-sync; partial upload failure (manifest unchanged); corrupted remote file; newer schema; first-sync merge; scheduled-transaction deterministic IDs not duplicated across devices.
