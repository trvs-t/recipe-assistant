import type { IRecipeSummary } from './contracts';

export const MAX_FOLDER_NAME_LENGTH: number = 48;

export type FolderFilter = 'all' | 'unfiled' | string;

export function normalizeFolderName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateFolderName(value: string): string | null {
  const normalizedName: string = normalizeFolderName(value);
  if (normalizedName.length === 0) {
    return 'Enter a folder name.';
  }
  if (normalizedName.length > MAX_FOLDER_NAME_LENGTH) {
    return `Folder names must be ${MAX_FOLDER_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

export function isRecipeInFolder(recipe: IRecipeSummary, filter: FolderFilter): boolean {
  const folderIds: string[] = recipe.folderIds ?? [];
  if (filter === 'all') {
    return true;
  }
  if (filter === 'unfiled') {
    return folderIds.length === 0;
  }
  return folderIds.includes(filter);
}

export function filterRecipesByFolder(
  recipes: readonly IRecipeSummary[],
  filter: FolderFilter,
): IRecipeSummary[] {
  return recipes.filter((recipe: IRecipeSummary): boolean => isRecipeInFolder(recipe, filter));
}
