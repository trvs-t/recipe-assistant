export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) {
    return '—';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours: number = Math.floor(minutes / 60);
  const remainingMinutes: number = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

export function formatDate(dateString: string): string {
  const date: Date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function getSourceLabel(sourceUrl: string | null): string {
  if (sourceUrl === null) {
    return 'Saved recipe';
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'External source';
  }
}

export function validateSourceUrl(value: string): string | null {
  const trimmedValue: string = value.trim();

  if (trimmedValue.length === 0) {
    return 'Paste a recipe URL to get started.';
  }

  try {
    const url: URL = new URL(trimmedValue);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'Use an http or https recipe URL.';
    }
  } catch {
    return 'Enter a complete recipe URL, such as https://example.com/recipe.';
  }

  return null;
}

export const MAX_BULK_IMPORT_URLS: number = 25;

export interface IParsedSourceUrls {
  urls: string[];
  errorMessage: string | null;
  hasOtherText: boolean;
}

function removeListMarker(line: string): string {
  return line.replace(/^\s*(?:(?:[-*+•‣◦▪–—]|\d+[.):])\s+)/, '');
}

const SOURCE_URL_PATTERN: RegExp = /https?:\/\/[^\s<>"',]+/gi;

function trimUrlPunctuation(candidate: string): string {
  let trimmedCandidate: string = candidate.replace(/[.,;:!?。]+$/u, '');
  const bracketPairs: readonly (readonly [string, string])[] = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ];

  for (const [openingBracket, closingBracket] of bracketPairs) {
    const openingCount: number = trimmedCandidate.split(openingBracket).length - 1;
    let closingCount: number = trimmedCandidate.split(closingBracket).length - 1;
    while (trimmedCandidate.endsWith(closingBracket) && closingCount > openingCount) {
      trimmedCandidate = trimmedCandidate.slice(0, -1);
      closingCount -= 1;
    }
  }

  return trimmedCandidate;
}

function containsOtherText(valueWithoutUrls: string): boolean {
  const normalizedRemainder: string = valueWithoutUrls
    .split(/\r?\n/)
    .map(removeListMarker)
    .join('\n')
    .replace(/[\s,;|()[\]{}<>:!?*+.•‣◦▪–—-]+/gu, '');
  return normalizedRemainder.length > 0;
}

export function parseSourceUrls(value: string): IParsedSourceUrls {
  const matches: RegExpMatchArray[] = [...value.matchAll(SOURCE_URL_PATTERN)];
  const candidates: string[] = matches.map((match: RegExpMatchArray): string => trimUrlPunctuation(match[0]));
  const valueWithoutUrls: string = value.replace(SOURCE_URL_PATTERN, '');
  const hasOtherText: boolean = containsOtherText(valueWithoutUrls);

  if (candidates.length === 0) {
    return {
      urls: [],
      errorMessage: 'Paste at least one complete http or https recipe URL to get started.',
      hasOtherText,
    };
  }

  const urls: string[] = [...new Set<string>(candidates)];
  if (urls.length > MAX_BULK_IMPORT_URLS) {
    return {
      urls,
      errorMessage: `Import up to ${MAX_BULK_IMPORT_URLS} recipe URLs at a time.`,
      hasOtherText,
    };
  }

  for (const [index, url] of urls.entries()) {
    const errorMessage: string | null = validateSourceUrl(url);
    if (errorMessage !== null) {
      return {
        urls,
        errorMessage: `URL ${index + 1}: ${errorMessage}`,
        hasOtherText,
      };
    }
  }

  return { urls, errorMessage: null, hasOtherText };
}
