import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

export default function App() {
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
              </section>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
