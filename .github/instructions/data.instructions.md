---
description: Rules for IndexedDB (Dexie), repositories, migrations, backup and trash
applyTo: "src/data/**"
---

- All reads and writes go through repository modules. Each write sets `updatedAt` (UTC now) and validates with Zod before saving.
- Deletes are soft (`deleted: true`, bump `updatedAt`). Provide separate explicit functions for restore-from-trash and permanent purge.
- Multi-record changes (a transaction with splits, category reassignment, etc.) happen inside a single Dexie transaction.
- Schema changes require: bump `schemaVersion`, add a forward migration with a test using a fixture of the previous version, and never destroy data in a migration. Refuse to load data written by a newer schema than the app understands.
- Device-local settings (storage mode, Client ID, last-sync info, device ID) live in a separate `deviceSettings` store and are **never** synced.
- Request persistent storage (`navigator.storage.persist()`) at startup and surface the result in Settings.
- Backup/export produces one versioned JSON document that round-trips through restore without loss (test this).
- Deleting a category reassigns its transactions to the built-in `Other` category. Deleting a payee reassigns to `Unspecified`. Accounts with transactions cannot be deleted, only hidden or archived.
