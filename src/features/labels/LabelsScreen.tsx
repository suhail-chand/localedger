import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Tags, Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { db } from "@/data/db";
import { createLabelRepository } from "@/data/repositories";
import type { Label } from "@/domain/types";

const repository = createLabelRepository(db);

type LabelFormValues = {
  name: string;
  color: string;
};

export function LabelsScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label>();
  const [deletingLabel, setDeletingLabel] = useState<Label>();
  const [form, setForm] = useState<LabelFormValues>({
    name: "",
    color: "#2563EB",
  });
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [saving, setSaving] = useState(false);

  const labels = useLiveQuery(
    async () => {
      try {
        return { labels: await repository.list(), error: null };
      } catch (error) {
        return {
          labels: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load labels",
        };
      }
    },
    [],
  );
  const visibleLabels = useMemo(
    () => labels?.labels ?? [],
    [labels],
  );

  function openCreate(): void {
    setEditingLabel(undefined);
    setForm({ name: "", color: "#2563EB" });
    setFormError("");
    setSheetOpen(true);
  }

  function openEdit(label: Label): void {
    setEditingLabel(label);
    setForm({ name: label.name, color: label.color });
    setFormError("");
    setSheetOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (editingLabel) {
        await repository.update(editingLabel.id, {
          name: form.name,
          color: form.color,
        });
      } else {
        await repository.create({
          name: form.name,
          color: form.color,
        });
      }
      setSheetOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save label",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!deletingLabel) return;
    setDeleteError("");
    try {
      await repository.softDelete(deletingLabel.id);
      setDeletingLabel(undefined);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete label",
      );
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Tags className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Labels</h1>
        </div>
        <Button onClick={openCreate}>Add label</Button>
      </div>

      {labels === undefined ? (
        <p role="status" className="text-sm text-gray-600">
          Loading labels...
        </p>
      ) : labels.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Unable to load labels: {labels.error}
        </p>
      ) : visibleLabels.length === 0 ? (
        <EmptyState
          title="No labels yet"
          description="Create a colour-coded label for transactions."
          action={<Button onClick={openCreate}>Create label</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLabels.map((label) => (
            <article
              key={label.id}
              className="flex min-h-16 items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: label.color }}
                aria-label={`${label.name} colour ${label.color}`}
              />
              <span className="flex-1 font-medium">{label.name}</span>
              <Button
                variant="secondary"
                onClick={() => openEdit(label)}
                aria-label={`Edit ${label.name}`}
                className="px-3"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDeletingLabel(label);
                  setDeleteError("");
                }}
                aria-label={`Delete ${label.name}`}
                className="px-3"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </article>
          ))}
        </div>
      )}

      <Sheet
        open={sheetOpen}
        title={editingLabel ? "Edit label" : "Add label"}
        onClose={() => setSheetOpen(false)}
      >
        <form onSubmit={save} noValidate>
          <label className="block text-sm font-medium">
            Name
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Colour
            <div className="mt-1 flex gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    color: event.target.value.toUpperCase(),
                  }))
                }
                className="h-11 w-16 rounded border border-gray-300 p-1 dark:border-gray-700"
                aria-label="Colour picker"
              />
              <input
                value={form.color}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
                pattern="^#[0-9A-Fa-f]{6}$"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
                aria-label="Hex colour"
                spellCheck={false}
              />
            </div>
          </label>
          {formError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        open={deletingLabel !== undefined}
        title={`Delete ${deletingLabel?.name ?? "label"}?`}
        description={
          deleteError ||
          "This label will be removed from transactions and scheduled entries."
        }
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => {
          setDeletingLabel(undefined);
          setDeleteError("");
        }}
      />
    </section>
  );
}
