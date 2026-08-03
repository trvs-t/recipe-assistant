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
