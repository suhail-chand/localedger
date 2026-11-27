---
description: Rules for Google auth and Drive sync
applyTo: "src/sync/**"
---
- Auth: Google Identity Services **token flow** in the browser only, scope `drive.appdata` only. No client secret. Keep the access token in memory, never persist it. If silent renewal fails, pause sync and show "Sign in to resume sync" without interrupting local use.
- Sync order is always: **pull, merge per record, then push.** Check the remote revision or `modifiedTime` immediately before writing, and re-pull if it changed.
- Merge rule per record ID: highest `updatedAt` wins, ties broken by `deviceId`. Tombstones propagate deletes. Never resurrect a tombstoned record from an older copy.
- Before the first sync, and before any step that replaces data on either side, write a snapshot first (local export and Drive `backups/`).
- Write order: data files first, `manifest.json` last (it is the commit marker). A half-finished sync must never leave the manifest pointing to inconsistent data.
- Validate every downloaded file with Zod. If a file is invalid or from a newer schema, **stop syncing, do not overwrite it**, and offer recovery from the last valid snapshot.
- Triggers: on open, on `visibilitychange` to hidden (best effort; the local save has already happened), and a manual "Sync now". Never rely on `beforeunload` or `pagehide` uploads completing.
- All Drive calls go through one small client module with typed errors (auth, network, quota, conflict, corrupt) so the UI can show precise states. Unit-test the sync engine against an in-memory fake Drive, including offline, token expiry, concurrent edits on two devices, and deletion conflicts.
