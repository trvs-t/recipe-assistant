import { describe, expect, it } from 'vitest';

import {
  createImportIdempotencyKey,
  createSupabaseAdapter,
  isImportJobStatus,
  isTerminalImportStatus,
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
});
