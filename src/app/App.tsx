import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import {
  initializeDeviceSettings,
  requestPersistentStorage,
  type PersistentStorageStatus,
} from "@/data/deviceSettings";
import { db, ensureDatabaseReady } from "@/data/db";

export default function App() {
  const [storageStatus, setStorageStatus] =
    useState<PersistentStorageStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await ensureDatabaseReady(db);
      await initializeDeviceSettings(db);
      const status = await requestPersistentStorage(
        navigator.storage as
          | {
              persist?: () => Promise<boolean>;
              persisted?: () => Promise<boolean>;
            }
          | undefined,
      );
      if (!cancelled) {
        setStorageStatus(status);
      }
    })().catch(() => {
      if (!cancelled) {
        setStorageStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <Routes>
          <Route
            path="/"
            element={
              <section
                className="max-w-md text-center"
                aria-labelledby="app-title"
              >
                <h1 id="app-title" className="text-3xl font-semibold">
                  Localedger
                </h1>
                <p className="mt-3 text-gray-600 dark:text-gray-300">
                  Your local-first personal finance tracker.
                </p>
                <p
                  className="mt-4 text-sm text-gray-500 dark:text-gray-400"
                  role="status"
                >
                  Persistent storage: {storageStatus}
                </p>
              </section>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
