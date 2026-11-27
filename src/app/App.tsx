import { useEffect, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  CircleDollarSign,
  FolderTree,
  Tags,
  Users,
  ArrowLeftRight,
  CalendarClock,
} from "lucide-react";

import {
  initializeDeviceSettings,
  requestPersistentStorage,
  type PersistentStorageStatus,
} from "@/data/deviceSettings";
import { db, ensureDatabaseReady } from "@/data/db";
import { evaluateSchedules } from "@/data/scheduleEvaluation";
import { AccountsScreen } from "@/features/accounts/AccountsScreen";
import { CategoriesScreen } from "@/features/categories/CategoriesScreen";
import { PayeesScreen } from "@/features/payees/PayeesScreen";
import { LabelsScreen } from "@/features/labels/LabelsScreen";
import { TransactionsScreen } from "@/features/transactions/TransactionsScreen";
import { SchedulesScreen } from "@/features/schedules/SchedulesScreen";

const navigation = [
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/schedules", label: "Schedules", icon: CalendarClock },
  { to: "/accounts", label: "Accounts", icon: CircleDollarSign },
  { to: "/categories", label: "Categories", icon: FolderTree },
  { to: "/payees", label: "Payees", icon: Users },
  { to: "/labels", label: "Labels", icon: Tags },
];

export default function App() {
  const [storageStatus, setStorageStatus] =
    useState<PersistentStorageStatus>("checking");
  const [scheduleError, setScheduleError] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    let evaluating = false;

    async function evaluateInForeground(): Promise<void> {
      if (cancelled || evaluating || document.visibilityState === "hidden") {
        return;
      }

      evaluating = true;
      try {
        await ensureDatabaseReady(db);
        await evaluateSchedules(db);
        if (!cancelled) {
          setScheduleError("");
        }
      } catch (caught) {
        if (!cancelled) {
          setScheduleError(
            caught instanceof Error
              ? `Schedule evaluation failed: ${caught.message}`
              : "Schedule evaluation failed",
          );
        }
      } finally {
        evaluating = false;
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void evaluateInForeground();
      }
    }

    function handleSchedulesChanged(): void {
      void evaluateInForeground();
    }

    void evaluateInForeground();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleSchedulesChanged);
    window.addEventListener(
      "localedger:schedules-changed",
      handleSchedulesChanged,
    );

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleSchedulesChanged);
      window.removeEventListener(
        "localedger:schedules-changed",
        handleSchedulesChanged,
      );
    };
  }, []);

  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-gray-200 bg-white px-4 py-6 dark:border-gray-800 dark:bg-gray-900 md:flex md:flex-col">
          <h1 className="px-3 text-xl font-semibold">Localedger</h1>
          <nav className="mt-8 space-y-1" aria-label="Reference data">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 ${
                    isActive
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <p className="mt-auto px-3 text-xs text-gray-500" role="status">
            Persistent storage: {storageStatus}
          </p>
        </aside>

        <main className="min-w-0 pb-24 md:pb-0">
          <header className="flex h-14 items-center border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 md:hidden">
            <h1 className="font-semibold">Localedger</h1>
          </header>
          <div className="p-4 md:p-8">
            {scheduleError ? (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              >
                {scheduleError}
              </p>
            ) : null}
            <Routes>
              <Route
                path="/"
                element={<Navigate to="/transactions" replace />}
              />
              <Route path="/transactions" element={<TransactionsScreen />} />
              <Route path="/schedules" element={<SchedulesScreen />} />
              <Route path="/accounts" element={<AccountsScreen />} />
              <Route path="/categories" element={<CategoriesScreen />} />
              <Route path="/payees" element={<PayeesScreen />} />
              <Route path="/labels" element={<LabelsScreen />} />
              <Route
                path="*"
                element={<Navigate to="/transactions" replace />}
              />
            </Routes>
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-6 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:hidden"
          aria-label="Reference data mobile"
        >
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${
                  isActive
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-300"
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </HashRouter>
  );
}
