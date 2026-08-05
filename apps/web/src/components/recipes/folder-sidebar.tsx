import { useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';

import { Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { folderQueryKeys, recipeQueryKeys } from '@/features/recipes/queries';
import {
  normalizeFolderName,
  type FolderFilter,
  validateFolderName,
} from '@/features/recipes/folders';
import { supabaseAdapter } from '@/lib/supabase';

import type { IFolder, IRecipeSummary } from '@/features/recipes/contracts';

export interface IFolderSidebarProps {
  folders: readonly IFolder[];
  recipes: readonly IRecipeSummary[];
  selectedFilter: FolderFilter;
  onSelectFilter: (filter: FolderFilter) => void;
}

export function FolderSidebar({
  folders,
  recipes,
  selectedFilter,
  onSelectFilter,
}: IFolderSidebarProps): ReactElement {
  const queryClient = useQueryClient();
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useMutation<IFolder, Error, string>({
    mutationFn: (name: string): Promise<IFolder> => supabaseAdapter.createFolder(name),
    onSuccess: (): void => {
      setNewFolderName('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: folderQueryKeys.all });
    },
  });
  const renameMutation = useMutation<void, Error, { folderId: string; name: string }>({
    mutationFn: ({ folderId, name }): Promise<void> => supabaseAdapter.renameFolder(folderId, name),
    onSuccess: (): void => {
      setEditingFolderId(null);
      setEditingFolderName('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: folderQueryKeys.all });
    },
  });
  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (folderId: string): Promise<void> => supabaseAdapter.deleteFolder(folderId),
    onSuccess: (_data: void, deletedFolderId: string): void => {
      if (selectedFilter === deletedFolderId) {
        onSelectFilter('all');
      }
      void queryClient.invalidateQueries({ queryKey: folderQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.list() });
    },
  });

  const folderCount = (folderId: string): number => recipes.filter(
    (recipe: IRecipeSummary): boolean => (recipe.folderIds ?? []).includes(folderId),
  ).length;
  const unfiledCount: number = recipes.filter(
    (recipe: IRecipeSummary): boolean => (recipe.folderIds ?? []).length === 0,
  ).length;
  const isPending: boolean = createMutation.isPending || renameMutation.isPending || deleteMutation.isPending;
  const mutationError: Error | null = createMutation.error ?? renameMutation.error ?? deleteMutation.error;

  const submitNewFolder = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const errorMessage: string | null = validateFolderName(newFolderName);
    setFormError(errorMessage);
    if (errorMessage === null) {
      createMutation.mutate(normalizeFolderName(newFolderName));
    }
  };

  const beginRename = (folder: IFolder): void => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setFormError(null);
  };

  const submitRename = (event: FormEvent<HTMLFormElement>, folderId: string): void => {
    event.preventDefault();
    const errorMessage: string | null = validateFolderName(editingFolderName);
    setFormError(errorMessage);
    if (errorMessage === null) {
      renameMutation.mutate({ folderId, name: normalizeFolderName(editingFolderName) });
    }
  };

  const deleteFolder = (folder: IFolder): void => {
    if (!window.confirm(`Delete the “${folder.name}” folder? Recipes will stay in your library.`)) {
      return;
    }
    deleteMutation.mutate(folder.id);
  };

  return (
    <Card className="h-fit shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Folder className="text-[var(--primary)]" size={18} />
          Folders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <FolderFilterButton
            count={recipes.length}
            label="All recipes"
            onClick={(): void => onSelectFilter('all')}
            selected={selectedFilter === 'all'}
          />
          <FolderFilterButton
            count={unfiledCount}
            label="Unfiled"
            onClick={(): void => onSelectFilter('unfiled')}
            selected={selectedFilter === 'unfiled'}
          />
          {folders.map((folder: IFolder): ReactElement => (
            <div className="group" key={folder.id}>
              {editingFolderId === folder.id ? (
                <form className="flex items-center gap-1" onSubmit={(event: FormEvent<HTMLFormElement>): void => submitRename(event, folder.id)}>
                  <Input
                    aria-label={`Rename ${folder.name}`}
                    className="h-9 min-w-0 px-3"
                    onChange={(event: ChangeEvent<HTMLInputElement>): void => setEditingFolderName(event.target.value)}
                    value={editingFolderName}
                  />
                  <Button disabled={isPending} size="sm" type="submit">Save</Button>
                  <Button
                    onClick={(): void => setEditingFolderId(null)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    ×
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    aria-pressed={selectedFilter === folder.id}
                    className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedFilter === folder.id ? 'bg-[var(--primary-soft)] font-semibold text-[var(--primary)]' : 'hover:bg-[var(--muted)]'}`}
                    onClick={(): void => onSelectFilter(folder.id)}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{folder.name}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{folderCount(folder.id)}</span>
                    </span>
                  </button>
                  <Button
                    aria-label={`Rename ${folder.name}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(): void => beginRename(folder)}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    aria-label={`Delete ${folder.name}`}
                    className="opacity-0 text-[var(--destructive)] transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(): void => deleteFolder(folder)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="border-t border-[var(--border)] pt-4" onSubmit={submitNewFolder}>
          <label className="sr-only" htmlFor="new-folder-name">New folder name</label>
          <div className="flex items-center gap-2">
            <Input
              aria-describedby={formError !== null ? 'folder-form-message' : undefined}
              aria-invalid={formError !== null}
              className="h-10 min-w-0 px-3"
              id="new-folder-name"
              onChange={(event: ChangeEvent<HTMLInputElement>): void => {
                setNewFolderName(event.target.value);
                setFormError(null);
              }}
              placeholder="New folder"
              value={newFolderName}
            />
            <Button aria-label="Create folder" disabled={isPending} size="icon" type="submit">
              <Plus size={17} />
            </Button>
          </div>
          {formError !== null || mutationError !== null ? (
            <p className="mt-2 text-xs text-[var(--destructive)]" id="folder-form-message">
              {formError ?? mutationError?.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

interface IFolderFilterButtonProps {
  count: number;
  label: string;
  onClick: () => void;
  selected: boolean;
}

function FolderFilterButton({ count, label, onClick, selected }: IFolderFilterButtonProps): ReactElement {
  return (
    <button
      aria-pressed={selected}
      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-[var(--primary-soft)] font-semibold text-[var(--primary)]' : 'hover:bg-[var(--muted)]'}`}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{count}</span>
      </span>
    </button>
  );
}
