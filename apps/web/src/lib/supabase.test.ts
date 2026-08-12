import { describe, expect, it, vi } from 'vitest';

import {
  createImportIdempotencyKey,
  createRemoteAdapter,
  createSupabaseAdapter,
  isImportJobStatus,
  isMissingFolderSchemaError,
  isTerminalImportStatus,
  type TypedSupabaseClient,
} from './supabase';

describe('Supabase adapter', (): void => {
  it('falls back to demo mode when credentials are absent', async (): Promise<void> => {
    const adapter = createSupabaseAdapter({});
    const recipes = await adapter.listRecipes();

    expect(adapter.mode).toBe('demo');
    expect(adapter.client).toBeNull();
    expect(recipes.length).toBeGreaterThan(0);
  });

  it('keeps import submission local in demo mode', async (): Promise<void> => {
    const adapter = createSupabaseAdapter({ VITE_SUPABASE_URL: 'not-a-url' });
    const submission = await adapter.submitImport({ sourceUrl: 'https://example.com/recipe' });
    const restoredSubmission = await adapter.getImportSubmission(submission.id);
    const listedSubmissions = await adapter.listImportSubmissions();

    expect(submission.status).toBe('parsing');
    expect(submission.jobId).toBe(submission.id);
    expect(restoredSubmission?.sourceUrl).toBe('https://example.com/recipe');
    expect(listedSubmissions.some((item) => item.id === submission.id)).toBe(true);
  });

  it('keeps plain-text submission content local in demo mode', async (): Promise<void> => {
    const adapter = createSupabaseAdapter({ VITE_SUPABASE_URL: 'not-a-url' });
    const sourceText: string = 'Lemony rice bowl\n\nIngredients\n2 cups rice\n\nInstructions\nCook and serve.';
    const submission = await adapter.submitImport({ sourceUrl: null, sourceText });
    const restoredSubmission = await adapter.getImportSubmission(submission.id);

    expect(submission.sourceUrl).toBeNull();
    expect(submission.sourceText).toBe(sourceText);
    expect(restoredSubmission?.sourceText).toBe(sourceText);
  });

  it('persists ingredient edits and variations in demo mode', async (): Promise<void> => {
    const adapter = createSupabaseAdapter({ VITE_SUPABASE_URL: 'not-a-url' });
    const recipeId: string = 'demo-miso-salmon';
    const ingredientId: string = 'miso-salmon-1';

    await adapter.updateIngredient(recipeId, ingredientId, {
      name: 'trout',
      quantity: 3,
      unit: 'fillets',
      note: 'skin on',
    });
    const variationId: string = await adapter.addIngredientVariation(recipeId, {
      variationOfId: ingredientId,
      name: 'firm tofu',
      quantity: 3,
      unit: 'pieces',
      note: null,
    });

    const recipe = await adapter.getRecipe(recipeId);
    expect(variationId).toMatch(/^demo-variation-/);
    expect(recipe?.ingredients.find((item) => item.id === ingredientId)?.name).toBe('trout');
    expect(recipe?.ingredients.some((item) => item.variationOfId === ingredientId && item.name === 'firm tofu')).toBe(true);
  });

  it('returns the inserted variation id and sends a complete ingredient row', async (): Promise<void> => {
    let insertedRow: Record<string, unknown> | null = null;
    const fakeClient: TypedSupabaseClient = {
      from: vi.fn((): unknown => ({
        insert: vi.fn((row: Record<string, unknown>): unknown => {
          insertedRow = row;
          return {
            select: vi.fn((): unknown => ({
              maybeSingle: vi.fn(async (): Promise<{ data: { id: string }; error: null }> => ({
                data: { id: 'variation-1' },
                error: null,
              })),
            })),
          };
        }),
      })),
    } as unknown as TypedSupabaseClient;
    const adapter = createRemoteAdapter(fakeClient);

    await expect(adapter.addIngredientVariation('recipe-1', {
      variationOfId: 'ingredient-1',
      name: 'firm tofu',
      quantity: 3,
      unit: 'pieces',
      note: 'pressed',
    })).resolves.toBe('variation-1');
    expect(insertedRow).toEqual({
      recipe_id: 'recipe-1',
      original_text: '3 pieces firm tofu',
      quantity: 3,
      unit: 'pieces',
      name: 'firm tofu',
      notes: 'pressed',
      sort_order: 10_000,
      variation_of_id: 'ingredient-1',
    });
  });

  it('repairs clear ingredient links in demo mode', async (): Promise<void> => {
    const adapter = createSupabaseAdapter({ VITE_SUPABASE_URL: 'not-a-url' });
    await adapter.autoLinkRecipe('demo-citrus-soba');

    const recipe = await adapter.getRecipe('demo-citrus-soba');
    expect(recipe?.flow?.derivation).toBe('enriched');
    expect(recipe?.flow?.nodes.some((node) => node.ingredientIds.length > 0)).toBe(true);
  });

  it('creates, assigns, renames, and deletes folders in demo mode without deleting recipes', async (): Promise<void> => {
    const adapter = createSupabaseAdapter({ VITE_SUPABASE_URL: 'not-a-url' });
    const folder = await adapter.createFolder('  Test dinners  ');
    await adapter.setRecipeFolders('demo-tomato-toast', [folder.id]);

    const assignedRecipe = await adapter.getRecipe('demo-tomato-toast');
    expect(assignedRecipe?.folderIds).toEqual([folder.id]);

    await adapter.renameFolder(folder.id, 'Test favorites');
    expect((await adapter.listFolders()).find((item) => item.id === folder.id)?.name).toBe('Test favorites');

    await adapter.deleteFolder(folder.id);
    expect((await adapter.listFolders()).some((item) => item.id === folder.id)).toBe(false);
    expect(await adapter.getRecipe('demo-tomato-toast')).not.toBeNull();
    expect((await adapter.getRecipe('demo-tomato-toast'))?.folderIds).toEqual([]);
  });

  it('recognizes every durable import status and only terminal statuses stop polling', (): void => {
    const statuses: string[] = [
      'queued',
      'fetching',
      'extracting',
      'normalizing',
      'validating',
      'persisting',
      'retry_wait',
      'completed',
      'needs_input',
      'failed',
    ];

    for (const status of statuses) {
      expect(isImportJobStatus(status)).toBe(true);
    }

    expect(isTerminalImportStatus('completed')).toBe(true);
    expect(isTerminalImportStatus('needs_input')).toBe(true);
    expect(isTerminalImportStatus('failed')).toBe(true);
    expect(isTerminalImportStatus('fetching')).toBe(false);
  });

  it('creates non-empty idempotency keys for remote submissions', (): void => {
    const firstKey: string = createImportIdempotencyKey();
    const secondKey: string = createImportIdempotencyKey();

    expect(firstKey.length).toBeGreaterThan(0);
    expect(secondKey).not.toBe(firstKey);
  });

  it('keeps the recipe library usable while the folder migration is missing', async (): Promise<void> => {
    const missingFolderTableError = {
      code: 'PGRST205',
      message: "Could not find the table 'public.recipe_folders' in the schema cache",
    };
    const recipeRow = {
      id: 'recipe-1',
      title: 'Rice bowl',
      source_url: null,
      source_text: null,
      description: 'A simple bowl',
      prep_time_minutes: 5,
      cook_time_minutes: 10,
      servings: 2,
      dietary_tags: [],
      cuisine_type: null,
      status: 'parsed',
      parse_error: null,
      flow_graph: { derivation: 'linear_fallback', nodes: [], edges: [] },
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
    };
    const fakeClient: TypedSupabaseClient = {
      from: vi.fn((table: string): unknown => {
        if (table === 'recipes') {
          return {
            select: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [recipeRow], error: null })),
            })),
          };
        }
        if (table === 'recipe_folders') {
          return {
            select: vi.fn(async () => ({ data: null, error: missingFolderTableError })),
          };
        }
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({ data: null, error: missingFolderTableError })),
          })),
        };
      }),
    } as unknown as TypedSupabaseClient;

    expect(isMissingFolderSchemaError(missingFolderTableError)).toBe(true);
    expect(isMissingFolderSchemaError({ code: '42501', message: 'permission denied' })).toBe(false);

    const adapter = createRemoteAdapter(fakeClient);
    await expect(adapter.listRecipes()).resolves.toEqual([
      expect.objectContaining({ id: 'recipe-1', folderIds: [] }),
    ]);
    await expect(adapter.listFolders()).resolves.toEqual([]);
  });
});
