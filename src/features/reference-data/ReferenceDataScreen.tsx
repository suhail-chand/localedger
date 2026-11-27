import { useState, type ComponentType } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";

type ReferenceDataScreenProps = {
  title: string;
  singularName: string;
  icon: ComponentType<{ className?: string }>;
};

export function ReferenceDataScreen({
  title,
  singularName,
  icon: Icon,
}: ReferenceDataScreenProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add {singularName}
          </span>
        </Button>
      </div>

      <EmptyState
        title={`No ${title.toLowerCase()} yet`}
        description={`${title} management is ready for its first implementation slice.`}
        action={
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Create {singularName}
          </Button>
        }
      />

      <Sheet
        open={sheetOpen}
        title={`Add ${singularName}`}
        onClose={() => setSheetOpen(false)}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The {singularName} form will be implemented in the dedicated CRUD
          slice.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setSheetOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setConfirmOpen(true)}>Continue</Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title={`Confirm ${singularName} action`}
        description="No data has been changed. This confirms that the destructive-action dialog is available."
        confirmLabel="Confirm"
        onConfirm={() => setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
