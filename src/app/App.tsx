import { useEffect, useState } from "react";
import {
  HashRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import {
  CircleDollarSign,
  FolderTree,
  Tags,
  Users,
} from "lucide-react";

import {
  initializeDeviceSettings,
  requestPersistentStorage,
  type PersistentStorageStatus,
} from "@/data/deviceSettings";
import { db, ensureDatabaseReady } from "@/data/db";
import { ReferenceDataScreen } from "@/features/reference-data/ReferenceDataScreen";
import { AccountsScreen } from "@/features/accounts/AccountsScreen";
import { CategoriesScreen } from "@/features/categories/CategoriesScreen";

const navigation = [
  { to: "/accounts", label: "Accounts", icon: CircleDollarSign },
  { to: "/categories", label: "Categories", icon: FolderTree },
  { to: "/payees", label: "Payees", icon: Users },
  { to: "/labels", label: "Labels", icon: Tags },
];

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

        <main className="min-w-0 pb-20 md:pb-0">
          <header className="flex h-14 items-center border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 md:hidden">
            <h1 className="font-semibold">Localedger</h1>
          </header>
          <div className="p-4 md:p-8">
            <Routes>
              <Route path="/" element={<Navigate to="/accounts" replace />} />
              <Route
                path="/accounts"
                element={<AccountsScreen />}
              />
              <Route
                path="/categories"
                element={<CategoriesScreen />}
              />
              <Route
                path="/payees"
                element={
                  <ReferenceDataScreen
                    title="Payees"
                    singularName="payee"
                    icon={Users}
                  />
                }
              />
              <Route
                path="/labels"
                element={
                  <ReferenceDataScreen
                    title="Labels"
                    singularName="label"
                    icon={Tags}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/accounts" replace />} />
            </Routes>
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 grid h-16 grid-cols-4 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:hidden"
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
