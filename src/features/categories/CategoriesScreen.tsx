import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Briefcase,
  Car,
  Ellipsis,
  FolderTree,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Percent,
  Receipt,
  ShoppingBasket,
  Utensils,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { db } from "@/data/db";
import { SEED_IDS } from "@/data/seed";
import {
  createCategoryGroupRepository,
  createCategoryRepository,
} from "@/data/repositories";
import { categoryGroupSchema, categorySchema } from "@/domain/schemas";
import type { Category, CategoryGroup } from "@/domain/types";

const iconOptions: readonly { key: string; label: string; icon: LucideIcon }[] =
  [
    { key: "ellipsis", label: "Other", icon: Ellipsis },
    { key: "utensils", label: "Food", icon: Utensils },
    { key: "basket", label: "Shopping", icon: ShoppingBasket },
    { key: "home", label: "Home", icon: Home },
    { key: "car", label: "Transport", icon: Car },
    { key: "heart", label: "Health", icon: HeartPulse },
    { key: "education", label: "Education", icon: GraduationCap },
    { key: "gift", label: "Gifts", icon: Gift },
    { key: "briefcase", label: "Work", icon: Briefcase },
    { key: "percent", label: "Interest", icon: Percent },
    { key: "receipt", label: "Tax", icon: Receipt },
  ];

const iconByKey = new Map(
  iconOptions.map((option) => [option.key, option.icon]),
);

type GroupKind = "expense" | "income";
type GroupFormValues = { name: string; kind: GroupKind };
type CategoryFormValues = {
  name: string;
  icon: string;
  groupId: string;
  kind: GroupKind;
};

const groupRepository = createCategoryGroupRepository(db);
const categoryRepository = createCategoryRepository(db);

export function CategoriesScreen() {
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CategoryGroup>();
  const [editingCategory, setEditingCategory] = useState<Category>();
  const [deletingGroup, setDeletingGroup] = useState<CategoryGroup>();
  const [deletingCategory, setDeletingCategory] = useState<Category>();
  const [groupForm, setGroupForm] = useState<GroupFormValues>({
    name: "",
    kind: "expense",
  });
  const [categoryForm, setCategoryForm] = useState<CategoryFormValues>({
    name: "",
    icon: "ellipsis",
    kind: "expense",
    groupId: "",
  });
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [saving, setSaving] = useState(false);

  const data = useLiveQuery(async () => {
    try {
      return {
        groups: await groupRepository.list(),
        categories: await categoryRepository.list(),
        error: null,
      };
    } catch (error) {
      return {
        groups: null,
        categories: null,
        error:
          error instanceof Error ? error.message : "Unable to load categories",
      };
    }
  }, []);
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);

  function openCreateGroup(): void {
    setEditingGroup(undefined);
    setGroupForm({ name: "", kind: "expense" });
    setFormError("");
    setGroupSheetOpen(true);
  }

  function openEditGroup(group: CategoryGroup): void {
    setEditingGroup(group);
    setGroupForm({ name: group.name, kind: group.kind });
    setFormError("");
    setGroupSheetOpen(true);
  }

  function openCreateCategory(): void {
    const firstGroup = groups.find((group) => group.kind === "expense");
    setEditingCategory(undefined);
    setCategoryForm({
      name: "",
      icon: "ellipsis",
      kind: "expense",
      groupId: firstGroup?.id ?? "",
    });
    setFormError("");
    setCategorySheetOpen(true);
  }

  function openEditCategory(category: Category): void {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      icon: category.icon,
      kind: category.kind,
      groupId: category.groupId,
    });
    setFormError("");
    setCategorySheetOpen(true);
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const input = categoryGroupSchema.parse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        name: groupForm.name,
        kind: groupForm.kind,
      });
      if (editingGroup) {
        await groupRepository.update(editingGroup.id, input);
      } else {
        await groupRepository.create(input);
      }
      setGroupSheetOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save group",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const input = categorySchema.parse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        name: categoryForm.name,
        icon: categoryForm.icon,
        groupId: categoryForm.groupId,
        kind: categoryForm.kind,
      });
      if (editingCategory) {
        await categoryRepository.update(editingCategory.id, input);
      } else {
        await categoryRepository.create(input);
      }
      setCategorySheetOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save category",
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
        error instanceof Error ? error.message : "Unable to delete group",
      );
    }
  }

  async function deleteCategory(): Promise<void> {
    if (!deletingCategory) return;
    setDeleteError("");
    try {
      await categoryRepository.softDelete(deletingCategory.id);
      setDeletingCategory(undefined);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete category",
      );
    }
  }

  const categoryGroups = (["expense", "income"] as const).map((kind) => ({
    kind,
    groups: groups.filter((group) => group.kind === kind),
  }));

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FolderTree className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">Categories</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openCreateGroup}>
            Add group
          </Button>
          <Button onClick={openCreateCategory}>Add category</Button>
        </div>
      </div>

      {data === undefined ? (
        <p role="status" className="text-sm text-gray-600">
          Loading categories...
        </p>
      ) : data.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          Unable to load categories: {data.error}
        </p>
      ) : groups.length === 0 && categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create a category group and category."
          action={<Button onClick={openCreateGroup}>Create group</Button>}
        />
      ) : (
        categoryGroups.map(({ kind, groups: matchingGroups }) => (
          <section key={kind} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold capitalize">{kind}</h2>
            {matchingGroups.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No {kind} groups.
              </p>
            ) : (
              <div className="space-y-4">
                {matchingGroups.map((group) => (
                  <article
                    key={group.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-medium">{group.name}</h3>
                      {group.id === SEED_IDS.expenseOtherGroup ||
                      group.id === SEED_IDS.incomeOtherGroup ? (
                        <span className="text-xs text-gray-500">Built-in</span>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => openEditGroup(group)}
                            aria-label={`Edit group ${group.name}`}
                            className="px-3"
                          >
                            <Pencil className="h-4 w-4" />
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
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {categories
                        .filter((category) => category.groupId === group.id)
                        .map((category) => {
                          const Icon = iconByKey.get(category.icon) ?? Ellipsis;
                          return (
                            <div
                              key={category.id}
                              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                            >
                              <Icon
                                className="h-5 w-5 text-blue-600"
                                aria-hidden="true"
                              />
                              <span className="flex-1">{category.name}</span>
                              {category.builtIn ? (
                                <span className="text-xs text-gray-500">
                                  Built-in
                                </span>
                              ) : (
                                <>
                                  <Button
                                    variant="secondary"
                                    onClick={() => openEditCategory(category)}
                                    aria-label={`Edit ${category.name}`}
                                    className="px-3"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="danger"
                                    onClick={() => {
                                      setDeletingCategory(category);
                                      setDeleteError("");
                                    }}
                                    aria-label={`Delete ${category.name}`}
                                    className="px-3"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      <Sheet
        open={groupSheetOpen}
        title={editingGroup ? "Edit category group" : "Add category group"}
        onClose={() => setGroupSheetOpen(false)}
      >
        <form onSubmit={saveGroup} noValidate>
          <label className="block text-sm font-medium">
            Name
            <input
              value={groupForm.name}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Kind
            <select
              value={groupForm.kind}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  kind: event.target.value as GroupKind,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
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
        open={categorySheetOpen}
        title={editingCategory ? "Edit category" : "Add category"}
        onClose={() => setCategorySheetOpen(false)}
      >
        <form onSubmit={saveCategory} noValidate>
          <label className="block text-sm font-medium">
            Name
            <input
              value={categoryForm.name}
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Kind
            <select
              value={categoryForm.kind}
              onChange={(event) => {
                const kind = event.target.value as GroupKind;
                const first = groups.find((group) => group.kind === kind);
                setCategoryForm((current) => ({
                  ...current,
                  kind,
                  groupId: first?.id ?? "",
                }));
              }}
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium">
            Group
            <select
              value={categoryForm.groupId}
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  groupId: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"
            >
              {groups
                .filter((group) => group.kind === categoryForm.kind)
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Icon</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {iconOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={categoryForm.icon === option.key}
                    onClick={() =>
                      setCategoryForm((current) => ({
                        ...current,
                        icon: option.key,
                      }))
                    }
                    className={`flex min-h-11 items-center justify-center rounded-lg border ${categoryForm.icon === option.key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </fieldset>
          {formError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setCategorySheetOpen(false)}
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
          "This group will be moved to trash. It can only be deleted when it has no categories."
        }
        confirmLabel="Delete"
        onConfirm={() => void deleteGroup()}
        onCancel={() => {
          setDeletingGroup(undefined);
          setDeleteError("");
        }}
      />
      <ConfirmDialog
        open={deletingCategory !== undefined}
        title={`Delete ${deletingCategory?.name ?? "category"}?`}
        description={
          deleteError ||
          `Transactions using this category will be reassigned to ${deletingCategory?.kind === "income" ? "Income" : "Expense"} Other.`
        }
        confirmLabel="Delete"
        onConfirm={() => void deleteCategory()}
        onCancel={() => {
          setDeletingCategory(undefined);
          setDeleteError("");
        }}
      />
    </section>
  );
}
