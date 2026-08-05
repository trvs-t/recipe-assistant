import { describe, expect, it } from 'vitest';

import type { IRecipeSummary } from './contracts';
import {
  filterRecipesByFolder,
  normalizeFolderName,
  validateFolderName,
} from './folders';

const recipes: IRecipeSummary[] = [
  {
    id: 'recipe-1',
    title: 'Dinner',
    description: 'A dinner recipe',
    collection: 'Home',
    folderIds: ['folder-dinner'],
    tags: [],
    sourceUrl: null,
    servings: 2,
    prepMinutes: null,
    cookMinutes: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    status: 'parsed',
  },
  {
    id: 'recipe-2',
    title: 'Snack',
    description: 'A snack recipe',
    collection: 'Home',
    folderIds: [],
    tags: [],
    sourceUrl: null,
    servings: 1,
    prepMinutes: null,
    cookMinutes: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    status: 'parsed',
  },
];

describe('recipe folders', (): void => {
  it('normalizes names and validates the first-version limits', (): void => {
    expect(normalizeFolderName('  Weeknight   meals ')).toBe('Weeknight meals');
    expect(validateFolderName('')).toBe('Enter a folder name.');
    expect(validateFolderName('a'.repeat(49))).toContain('48');
    expect(validateFolderName('Dinner')).toBeNull();
  });

  it('filters all, unfiled, and assigned recipes', (): void => {
    expect(filterRecipesByFolder(recipes, 'all').map((recipe) => recipe.id)).toEqual(['recipe-1', 'recipe-2']);
    expect(filterRecipesByFolder(recipes, 'unfiled').map((recipe) => recipe.id)).toEqual(['recipe-2']);
    expect(filterRecipesByFolder(recipes, 'folder-dinner').map((recipe) => recipe.id)).toEqual(['recipe-1']);
  });
});
