import { describe, expect, it } from 'vitest';

import {
  MAX_BULK_IMPORT_URLS,
  MIN_PLAIN_RECIPE_TEXT_LENGTH,
  parseSourceUrls,
  validatePlainRecipeText,
  type IParsedSourceUrls,
} from './format';

describe('parseSourceUrls', (): void => {
  it('parses newline and whitespace separated URLs', (): void => {
    expect(parseSourceUrls('https://example.com/one\n  https://example.com/two')).toEqual({
      urls: ['https://example.com/one', 'https://example.com/two'],
      errorMessage: null,
      hasOtherText: false,
    });
  });

  it('accepts URLs pasted as bulleted and dashed lists', (): void => {
    expect(
      parseSourceUrls(
        '- https://example.com/one\n* https://example.com/two\n• https://example.com/three\n— https://example.com/four',
      ).urls,
    ).toEqual([
      'https://example.com/one',
      'https://example.com/two',
      'https://example.com/three',
      'https://example.com/four',
    ]);
  });

  it('accepts common numbered-list markers', (): void => {
    expect(
      parseSourceUrls(
        '1. https://example.com/one\n2) https://example.com/two\n3: https://example.com/three',
      ).urls,
    ).toEqual([
      'https://example.com/one',
      'https://example.com/two',
      'https://example.com/three',
    ]);
  });

  it('extracts URLs from prose and reports that other text remains', (): void => {
    expect(parseSourceUrls('Dinner idea: see (https://example.com/recipe).')).toEqual({
      urls: ['https://example.com/recipe'],
      errorMessage: null,
      hasOtherText: true,
    });
  });

  it('preserves balanced parentheses that belong to a URL', (): void => {
    expect(parseSourceUrls('https://example.com/wiki/Food_(dish)').urls).toEqual([
      'https://example.com/wiki/Food_(dish)',
    ]);
  });

  it('does not treat punctuation around a URL as other text', (): void => {
    expect(parseSourceUrls('(https://example.com/recipe).').hasOtherText).toBe(false);
  });

  it('removes duplicate URLs while preserving paste order', (): void => {
    expect(parseSourceUrls('https://example.com/one\nhttps://example.com/one\nhttps://example.com/two').urls).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ]);
  });

  it('flags non-URL input alongside extracted URLs as other text', (): void => {
    const parsed: IParsedSourceUrls = parseSourceUrls('https://example.com/one\nnot-a-url');

    expect(parsed.urls).toEqual(['https://example.com/one']);
    expect(parsed.hasOtherText).toBe(true);
    expect(parsed.errorMessage).toBeNull();
  });

  it('limits the number of unique URLs in one batch', (): void => {
    const urls: string[] = Array.from(
      { length: MAX_BULK_IMPORT_URLS + 1 },
      (_value: unknown, index: number): string => `https://example.com/${index}`,
    );

    expect(parseSourceUrls(urls.join('\n')).errorMessage).toBe(
      `Import up to ${MAX_BULK_IMPORT_URLS} recipe URLs at a time.`,
    );
  });

  it('accepts recipe text within the supported bounds', (): void => {
    const text: string = 'A recipe title\n\nIngredients\n2 cups rice\n\nInstructions\nCook the rice until tender.';

    expect(validatePlainRecipeText(text)).toBeNull();
  });

  it('rejects empty or oversized recipe text', (): void => {
    expect(validatePlainRecipeText('too short')).toBe(
      `Paste at least ${MIN_PLAIN_RECIPE_TEXT_LENGTH} characters of recipe text.`,
    );
    expect(validatePlainRecipeText('x'.repeat(20_001))).toContain('20,000');
  });
});
