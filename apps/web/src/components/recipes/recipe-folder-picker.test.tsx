import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  listFolders: vi.fn(async () => [{
    id: 'folder-dinners',
    name: 'Dinners',
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
  }]),
  setRecipeFolders: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdapter: adapterMocks }));

import { RecipeFolderPicker } from './recipe-folder-picker';

import type { IRecipe } from '@/features/recipes/contracts';

const recipe: IRecipe = {
  id: 'recipe-1',
  title: 'Dinner',
  description: 'A dinner recipe',
  collection: 'Home',
  folderIds: [],
  tags: [],
  sourceUrl: null,
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  updatedAt: '2026-08-06T00:00:00.000Z',
  status: 'parsed',
  ingredients: [],
  steps: [],
};

afterEach((): void => {
  cleanup();
});

describe('RecipeFolderPicker', (): void => {
  it('loads folders and persists a recipe assignment', async (): Promise<void> => {
    const user = userEvent.setup();
    const queryClient: QueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RecipeFolderPicker recipe={recipe} />
      </QueryClientProvider>,
    );

    const checkbox: HTMLElement = await screen.findByRole('checkbox', { name: 'Dinners' });
    await user.click(checkbox);

    await waitFor((): void => {
      expect(adapterMocks.setRecipeFolders).toHaveBeenCalledWith('recipe-1', ['folder-dinners']);
    });
  });
});
