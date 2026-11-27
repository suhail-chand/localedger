import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FolderTree, Pencil, Trash2, Users } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { db } from "@/data/db";
import {
  createPayeeGroupRepository,
  createPayeeRepository,
} from "@/data/repositories";
import { payeeGroupSchema, payeeSchema } from "@/domain/schemas";
import type { Payee, PayeeGroup } from "@/domain/types";

type GroupFormValues = { name: string };
type PayeeFormValues = { name: string; groupId: string };

const groupRepository = createPayeeGroupRepository(db);
const payeeRepository = createPayeeRepository(db);

export function PayeesScreen() {
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [payeeSheetOpen, setPayeeSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PayeeGroup>();
  const [editingPayee, setEditingPayee] = useState<Payee>();
  const [deletingGroup, setDeletingGroup] = useState<PayeeGroup>();
  const [deletingPayee, setDeletingPayee] = useState<Payee>();
  const [groupForm, setGroupForm] = useState<GroupFormValues>({ name: "" });
  const [payeeForm, setPayeeForm] = useState<PayeeFormValues>({
    name: "",
    groupId: "",
  });
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [saving, setSaving] = useState(false);

  const data = useLiveQuery(async () => {
    try {
      return {
        groups: await groupRepository.list(),
        payees: await payeeRepository.list(),
        error: null,
      };
    } catch (error) {
      return {
        groups: null,
        payees: null,
        error: error instanceof Error ? error.message : "Unable to load payees",
      };
    }
  }, []);
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const payees = useMemo(() => data?.payees ?? [], [data]);

  function openCreateGroup(): void {
    setEditingGroup(undefined);
    setGroupForm({ name: "" });
    setFormError("");
    setGroupSheetOpen(true);
  }

  function openEditGroup(group: PayeeGroup): void {
    setEditingGroup(group);
    setGroupForm({ name: group.name });
    setFormError("");
    setGroupSheetOpen(true);
  }

  function openCreatePayee(): void {
    setEditingPayee(undefined);
    setPayeeForm({ name: "", groupId: groups[0]?.id ?? "" });
    setFormError("");
    setPayeeSheetOpen(true);
  }

  function openEditPayee(payee: Payee): void {
    setEditingPayee(payee);
    setPayeeForm({ name: payee.name, groupId: payee.groupId ?? "" });
    setFormError("");
    setPayeeSheetOpen(true);
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const input = payeeGroupSchema.parse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        name: groupForm.name,
      });
      if (editingGroup) {
        await groupRepository.update(editingGroup.id, input);
      } else {
        await groupRepository.create(input);
      }
      setGroupSheetOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save payee group",
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePayee(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const input = payeeSchema.parse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        name: payeeForm.name,
        groupId: payeeForm.groupId || undefined,
      });
      if (editingPayee) {
        await payeeRepository.update(editingPayee.id, input);
      } else {
        await payeeRepository.create(input);
      }
      setPayeeSheetOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save payee",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(): Promise<void> {
    if (!deletingGroup) return;
    setDeleteError("");
    try {
      await groupRepository.softDelete(deletingGroup.id);
      setDeletingGroup(undefined);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete payee group",
      );
    }
  }

  async function deletePayee(): Promise<void> {
    if (!deletingPayee) return;
    setDeleteError("");
    try {
      await payeeRepository.softDelete(deletingPayee.id);
      setDeletingPayee(undefined);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete payee",
      );
    }
  }

  const grouped = groups.map((group) => ({
    group,
    payees: payees.filter((payee) => payee.groupId === group.id),
  }));
  const ungrouped = payees.filter(
    (payee) =>
      !payee.groupId || !groups.some((group) => group.id === payee.groupId),
  );

  function renderPayee(payee: Payee) {
    return (
      <div
        key={payee.id}
        className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
      >
        <Users className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <span className="flex-1">{payee.name}</span>
        {payee.builtIn ? (
          <span className="text-xs text-gray-500">Built-in</span>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => openEditPayee(payee)}
              aria-label={`Edit ${payee.name}`}
              className="px-3"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeletingPayee(payee);
                setDeleteError("");
              }}
              aria-label={`Delete ${payee.name}`}
              className="px-3"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">Payees</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openCreateGroup}>
            Add group
          </Button>
          <Button onClick={openCreatePayee}>Add payee</Button>
        </div>
      </div>

      {data === undefined ? (
        <p role="status" className="text-sm text-gray-600">
          Loading payees...
        </p>
      ) : data.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          Unable to load payees: {data.error}
        </p>
      ) : groups.length === 0 && payees.length === 0 ? (
        <EmptyState
          title="No payees yet"
          description="Create a payee group or add a payee."
          action={<Button onClick={openCreatePayee}>Create payee</Button>}
        />
      ) : (
        <>
          {grouped.map(({ group, payees: matching }) => (
            <section
              key={group.id}
              className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-5 w-5 text-blue-600" />
                  <h2 className="font-medium">{group.name}</h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => openEditGroup(group)}
                    aria-label={`Edit group ${group.name}`}
                    className="px-3"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDeletingGroup(group);
                      setDeleteError("");
                    }}
                    aria-label={`Delete group ${group.name}`}
                    className="px-3"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {matching.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  No payees in this group.
                </p>
              ) : (
                <div className="space-y-2">{matching.map(renderPayee)}</div>
              )}
            </section>
          ))}
          {ungrouped.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">Ungrouped</h2>
              <div className="space-y-2">{ungrouped.map(renderPayee)}</div>
            </section>
          ) : null}
        </>
      )}

      <Sheet
        open={groupSheetOpen}
        title={editingGroup ? "Edit payee group" : "Add payee group"}
        onClose={() => setGroupSheetOpen(false)}
      >
        <form onSubmit={saveGroup} noValidate>
          <label className="block text-sm font-medium">
            Name
            <input
              value={groupForm.name}
              onChange={(event) => setGroupForm({ name: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          {formError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setGroupSheetOpen(false)}
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

      <Sheet
        open={payeeSheetOpen}
        title={editingPayee ? "Edit payee" : "Add payee"}
        onClose={() => setPayeeSheetOpen(false)}
      >
        <form onSubmit={savePayee} noValidate>
          <label className="block text-sm font-medium">
            Name
            <input
              value={payeeForm.name}
              onChange={(event) =>
                setPayeeForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Group
            <select
              value={payeeForm.groupId}
              onChange={(event) =>
                setPayeeForm((current) => ({
                  ...current,
                  groupId: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Ungrouped</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          {formError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setPayeeSheetOpen(false)}
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
        open={deletingGroup !== undefined}
        title={`Delete ${deletingGroup?.name ?? "group"}?`}
        description={
          deleteError ||
          "This group will be moved to trash. It can only be deleted when it has no payees."
        }
        confirmLabel="Delete"
        onConfirm={() => void deleteGroup()}
        onCancel={() => {
          setDeletingGroup(undefined);
          setDeleteError("");
        }}
      />
      <ConfirmDialog
        open={deletingPayee !== undefined}
        title={`Delete ${deletingPayee?.name ?? "payee"}?`}
        description={
          deleteError ||
          "Transactions and schedules using this payee will be reassigned to Unspecified."
        }
        confirmLabel="Delete"
        onConfirm={() => void deletePayee()}
        onCancel={() => {
          setDeletingPayee(undefined);
          setDeleteError("");
        }}
      />
    </section>
  );
}
