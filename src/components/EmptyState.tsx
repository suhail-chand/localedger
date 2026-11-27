import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
