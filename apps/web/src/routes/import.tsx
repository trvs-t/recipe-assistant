import { createFileRoute, redirect } from '@tanstack/react-router';

interface IImportSearch {
  sourceUrl?: string;
}

function validateImportSearch(search: Record<string, unknown>): IImportSearch {
  const sourceUrl: unknown = search['sourceUrl'];
  return typeof sourceUrl === 'string' && sourceUrl.trim().length > 0
    ? { sourceUrl: sourceUrl.trim() }
    : {};
}

export const Route = createFileRoute('/import')({
  validateSearch: (search: Record<string, unknown>): IImportSearch => validateImportSearch(search),
  beforeLoad: ({ search }): never => {
    throw redirect({ to: '/', search, replace: true });
  },
});
