import { useEffect, useState, type ChangeEvent, type ReactElement } from 'react';

import { Folder } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { folderQueryKeys, recipeQueryKeys, useFolderListQuery } from '@/features/recipes/queries';
import { supabaseAdapter } from '@/lib/supabase';

import type { IFolder, IRecipe } from '@/features/recipes/contracts';

export interface IRecipeFolderPickerProps {
  recipe: IRecipe;
}

export function RecipeFolderPicker({ recipe }: IRecipeFolderPickerProps): ReactElement | null {
  const queryClient = useQueryClient();
  const foldersQuery = useFolderListQuery();
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(recipe.folderIds ?? []);
  const folderMutation = useMutation<void, Error, string[]>({
    mutationFn: (folderIds: string[]): Promise<void> => supabaseAdapter.setRecipeFolders(recipe.id, folderIds),
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.detail(recipe.id) });
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.list() });
      void queryClient.invalidateQueries({ queryKey: folderQueryKeys.all });
    },
  });

  useEffect((): void => {
    setSelectedFolderIds(recipe.folderIds ?? []);
  }, [recipe.folderIds, recipe.id]);

  const toggleFolder = (event: ChangeEvent<HTMLInputElement>, folderId: string): void => {
    const nextFolderIds: string[] = event.target.checked
      ? [...selectedFolderIds, folderId]
      : selectedFolderIds.filter((currentFolderId: string): boolean => currentFolderId !== folderId);
    setSelectedFolderIds(nextFolderIds);
    folderMutation.mutate(nextFolderIds);
  };

  const folders: IFolder[] = foldersQuery.data ?? [];

  if (!foldersQuery.isPending && !foldersQuery.isError && folders.length === 0) {
    return null;
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Folder className="text-[var(--primary)]" size={18} />
          Organize recipe
        </CardTitle>
      </CardHeader>
      <CardContent>
        {foldersQuery.isPending ? (
          <p className="text-sm text-[var(--muted-foreground)]">Loading folders…</p>
        ) : foldersQuery.isError ? (
          <p className="text-sm text-[var(--destructive)]">{foldersQuery.error.message}</p>
        ) : (
          <fieldset className="grid gap-3 sm:grid-cols-2" disabled={folderMutation.isPending}>
            <legend className="sr-only">Recipe folders</legend>
            {folders.map((folder: IFolder): ReactElement => (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-sm hover:bg-[var(--muted)]" key={folder.id}>
                <input
                  checked={selectedFolderIds.includes(folder.id)}
                  onChange={(event: ChangeEvent<HTMLInputElement>): void => toggleFolder(event, folder.id)}
                  type="checkbox"
                />
                <span className="min-w-0 truncate">{folder.name}</span>
              </label>
            ))}
          </fieldset>
        )}
        {folderMutation.error !== null ? (
          <p className="mt-3 text-sm text-[var(--destructive)]">{folderMutation.error.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
