import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';

import { ArrowRight, BookOpen, CircleAlert, Link2, LoaderCircle, Search } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { RecipeCard } from '@/components/recipes/recipe-card';
import { FolderSidebar } from '@/components/recipes/folder-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  recipeQueryKeys,
  useFolderListQuery,
  useImportSubmissionListQuery,
  useRecipeListQuery,
} from '@/features/recipes/queries';
import { filterRecipesByFolder, type FolderFilter } from '@/features/recipes/folders';
import {
  getSourceLabel,
  MAX_BULK_IMPORT_URLS,
  parseSourceUrls,
  validatePlainRecipeText,
  type IParsedSourceUrls,
} from '@/lib/format';
import {
  createImportIdempotencyKey,
  isTerminalImportStatus,
  supabaseAdapter,
  type IImportRequestWithIdempotencyKey,
  type IImportSubmission,
} from '@/lib/supabase';

import type { IRecipeSummary } from '@/features/recipes/contracts';

export interface ILibrarySearch {
  sourceUrl?: string;
}

export function validateLibrarySearch(search: Record<string, unknown>): ILibrarySearch {
  const sourceUrl: unknown = search['sourceUrl'];
  return typeof sourceUrl === 'string' && sourceUrl.trim().length > 0
    ? { sourceUrl: sourceUrl.trim() }
    : {};
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): ILibrarySearch => validateLibrarySearch(search),
  component: LibraryPage,
});

type ImportCardState = 'submitting' | 'queued' | 'failed';

interface ILibraryImport {
  clientId: string;
  sourceUrl: string | null;
  sourceText: string | null;
  state: ImportCardState;
  submissionId: string | null;
  message: string | null;
}

function LibraryPage(): ReactElement {
  const { sourceUrl: sourceUrlFromSearch } = Route.useSearch();
  const [importMode, setImportMode] = useState<'url' | 'text'>('url');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<FolderFilter>('all');
  const [sourceUrls, setSourceUrls] = useState<string>(sourceUrlFromSearch ?? '');
  const [sourceText, setSourceText] = useState<string>('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [libraryImports, setLibraryImports] = useState<ILibraryImport[]>([]);
  const queryClient: QueryClient = useQueryClient();
  const recipesQuery = useRecipeListQuery();
  const foldersQuery = useFolderListQuery();
  const importSubmissionsQuery = useImportSubmissionListQuery();
  const recipes: IRecipeSummary[] = recipesQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
  const importSubmissions: IImportSubmission[] = importSubmissionsQuery.data ?? [];
  const activeImportSubmissions: IImportSubmission[] = useMemo(
    (): IImportSubmission[] => importSubmissions.filter(
      (submission: IImportSubmission): boolean => !isTerminalImportStatus(submission.status),
    ),
    [importSubmissions],
  );
  const visibleLibraryImports: ILibraryImport[] = useMemo((): ILibraryImport[] => {
    const persistedSubmissionIds: Set<string> = new Set(
      importSubmissions.map((submission: IImportSubmission): string => submission.id),
    );
    const optimisticImports: ILibraryImport[] = libraryImports.filter(
      (item: ILibraryImport): boolean =>
        item.submissionId === null || !persistedSubmissionIds.has(item.submissionId),
    );
    const hydratedImports: ILibraryImport[] = activeImportSubmissions.map(
      (submission: IImportSubmission): ILibraryImport => ({
        clientId: `server:${submission.id}`,
        sourceUrl: submission.sourceUrl,
        sourceText: submission.sourceText,
        state: 'queued',
        submissionId: submission.id,
        message: submission.message,
      }),
    );
    return [...optimisticImports, ...hydratedImports];
  }, [activeImportSubmissions, importSubmissions, libraryImports]);
  const normalizedSearchTerm: string = searchTerm.trim().toLowerCase();
  const filteredRecipes: IRecipeSummary[] = useMemo(
    (): IRecipeSummary[] =>
      filterRecipesByFolder(recipes, selectedFolderFilter).filter((recipe: IRecipeSummary): boolean => {
        if (normalizedSearchTerm.length === 0) {
          return true;
        }

        return [recipe.title, recipe.description, recipe.collection, ...recipe.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearchTerm);
      }),
    [normalizedSearchTerm, recipes, selectedFolderFilter],
  );

  useEffect((): void => {
    if (sourceUrlFromSearch !== undefined) {
      setSourceUrls(sourceUrlFromSearch);
      setValidationMessage(null);
      document.getElementById('source-input')?.focus();
    }
  }, [sourceUrlFromSearch]);

  useEffect((): void => {
    const completedSubmission: IImportSubmission | undefined = importSubmissions.find(
      (submission: IImportSubmission): boolean =>
        (submission.status === 'completed' || submission.status === 'parsed') && submission.recipeId !== null,
    );
    if (completedSubmission !== undefined) {
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.list() });
    }
  }, [importSubmissions, queryClient]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSearchTerm(event.target.value);
  };

  const updateLibraryImport = (clientId: string, update: Partial<ILibraryImport>): void => {
    setLibraryImports((currentImports: ILibraryImport[]): ILibraryImport[] =>
      currentImports.map((item: ILibraryImport): ILibraryImport =>
        item.clientId === clientId ? { ...item, ...update } : item,
      ),
    );
  };

  const submitLibraryImport = async (item: ILibraryImport): Promise<void> => {
    const request: IImportRequestWithIdempotencyKey = {
      sourceUrl: item.sourceUrl,
      sourceText: item.sourceText ?? undefined,
      idempotencyKey: item.clientId,
    };

    try {
      const submission: IImportSubmission = await supabaseAdapter.submitImport(request);
      updateLibraryImport(item.clientId, {
        state: 'queued',
        submissionId: submission.id,
        message: submission.message,
      });
    } catch (error: unknown) {
      updateLibraryImport(item.clientId, {
        state: 'failed',
        message: error instanceof Error ? error.message : 'The recipe import could not be submitted.',
      });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (importMode === 'text') {
      const textError: string | null = validatePlainRecipeText(sourceText);
      setValidationMessage(textError);
      if (textError !== null) {
        return;
      }

      const newImport: ILibraryImport = {
        clientId: createImportIdempotencyKey(),
        sourceUrl: null,
        sourceText: sourceText.trim(),
        state: 'submitting',
        submissionId: null,
        message: null,
      };
      setLibraryImports((currentImports: ILibraryImport[]): ILibraryImport[] => [newImport, ...currentImports]);
      setSourceText('');
      setValidationMessage(null);
      setSubmitting(true);
      await submitLibraryImport(newImport);
      setSubmitting(false);
      return;
    }

    const parsed: IParsedSourceUrls = parseSourceUrls(sourceUrls);
    setValidationMessage(parsed.errorMessage);

    if (parsed.errorMessage !== null) {
      return;
    }

    if (parsed.hasOtherText) {
      const confirmed: boolean = window.confirm(
        `Found ${parsed.urls.length} recipe ${parsed.urls.length === 1 ? 'URL' : 'URLs'}. Other pasted text will be ignored. Continue?`,
      );
      if (!confirmed) {
        return;
      }
    }

    const newImports: ILibraryImport[] = parsed.urls.map((sourceUrl: string): ILibraryImport => ({
      clientId: createImportIdempotencyKey(),
      sourceUrl,
      sourceText: null,
      state: 'submitting',
      submissionId: null,
      message: null,
    }));

    setLibraryImports((currentImports: ILibraryImport[]): ILibraryImport[] => [
      ...newImports,
      ...currentImports,
    ]);
    setSourceUrls('');
    setValidationMessage(null);
    setSubmitting(true);
    await Promise.all(newImports.map(submitLibraryImport));
    setSubmitting(false);
  };

  const candidateCount: number = importMode === 'url' ? parseSourceUrls(sourceUrls).urls.length : sourceText.trim().length > 0 ? 1 : 0;

  return (
    <div className="space-y-8">
      <section aria-labelledby="library-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,.78fr)] lg:items-start">
        <div className="pt-1">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
            <BookOpen size={17} />
            <span>Recipe library</span>
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl" id="library-title">
            Your recipes
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
            Everything you have saved, ready for the next meal.
          </p>
        </div>

        <Card className="border-[var(--border-strong)] shadow-none" id="import-recipe">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold tracking-tight">Import a recipe</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Paste a link or recipe text to start a new library entry.</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <Link2 size={17} />
              </span>
            </div>
            <div aria-label="Import type" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-[var(--muted)] p-1" role="group">
              <Button
                aria-pressed={importMode === 'url'}
                className={importMode === 'url' ? 'bg-[var(--card)] shadow-sm' : ''}
                onClick={(): void => {
                  setImportMode('url');
                  setValidationMessage(null);
                }}
                type="button"
                variant="ghost"
              >
                Recipe URL
              </Button>
              <Button
                aria-pressed={importMode === 'text'}
                className={importMode === 'text' ? 'bg-[var(--card)] shadow-sm' : ''}
                onClick={(): void => {
                  setImportMode('text');
                  setValidationMessage(null);
                }}
                type="button"
                variant="ghost"
              >
                Plain text
              </Button>
            </div>
            <form onSubmit={(event: FormEvent<HTMLFormElement>): void => void handleSubmit(event)}>
              <Label className="sr-only" htmlFor="source-input">{importMode === 'url' ? 'Recipe URLs' : 'Recipe text'}</Label>
              <Textarea
                aria-describedby={validationMessage !== null ? 'source-input-message' : 'source-input-hint'}
                aria-invalid={validationMessage !== null}
                className="min-h-32 resize-none leading-6"
                id="source-input"
                onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
                  if (importMode === 'url') {
                    setSourceUrls(event.target.value);
                  } else {
                    setSourceText(event.target.value);
                  }
                  setValidationMessage(null);
                }}
                placeholder={importMode === 'url' ? 'Paste a recipe URL…' : 'Paste a recipe title, ingredients, and instructions…'}
                value={importMode === 'url' ? sourceUrls : sourceText}
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {validationMessage !== null ? (
                  <p className="text-sm text-[var(--destructive)]" id="source-input-message">{validationMessage}</p>
                ) : (
                  <p className="text-xs text-[var(--muted-foreground)]" id="source-input-hint">
                    {importMode === 'url' ? `Up to ${MAX_BULK_IMPORT_URLS} public recipe links.` : 'Paste at least 50 characters; the recipe will be parsed for review.'}
                  </p>
                )}
                <Button className="shrink-0 sm:min-w-36" disabled={submitting} type="submit">
                  {submitting
                    ? 'Adding…'
                    : importMode === 'url' && candidateCount > 1
                      ? `Import ${candidateCount} recipes`
                      : 'Import recipe'}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-7 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Library</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {recipes.length} saved {recipes.length === 1 ? 'recipe' : 'recipes'}
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={17} />
          <Input aria-label="Search recipes" className="pl-10" onChange={handleSearchChange} placeholder="Search your library" value={searchTerm} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <FolderSidebar
          folders={folders}
          onSelectFilter={setSelectedFolderFilter}
          recipes={recipes}
          selectedFilter={selectedFolderFilter}
        />
        <div className="min-w-0 space-y-5">
          {visibleLibraryImports.length > 0 ? (
            <div aria-label="Recipes being imported" aria-live="polite" className="grid gap-5 md:grid-cols-2">
              {visibleLibraryImports.map((item: ILibraryImport): ReactElement => (
                <ImportingRecipeCard item={item} key={item.clientId} />
              ))}
            </div>
          ) : null}

          {recipesQuery.isPending ? (
            <div className="grid gap-5 md:grid-cols-2">
              {[1, 2, 3].map((item: number): ReactElement => (
                <Card className="h-72 animate-pulse bg-[var(--muted)]" key={item} />
              ))}
            </div>
          ) : recipesQuery.isError ? (
            <Card className="flex flex-col items-start gap-4 p-6">
              <Badge variant="warning">Could not load library</Badge>
              <p className="max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">
                {recipesQuery.error instanceof Error ? recipesQuery.error.message : 'Try again in a moment.'}
              </p>
              <Button onClick={(): void => void recipesQuery.refetch()} variant="outline">Try again</Button>
            </Card>
          ) : filteredRecipes.length === 0 ? (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><Search size={21} /></span>
              <h3 className="font-display text-xl font-semibold">No recipes found</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">Try a different search, folder, or paste a recipe link above.</p>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {filteredRecipes.map((recipe: IRecipeSummary): ReactElement => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportingRecipeCard({ item }: { item: ILibraryImport }): ReactElement {
  const failed: boolean = item.state === 'failed';
  const title: string = failed
    ? `Could not import ${item.sourceUrl === null ? 'pasted recipe text' : `from ${getSourceLabel(item.sourceUrl)}`}`
    : item.sourceUrl === null
      ? 'Importing pasted recipe text'
      : `Importing from ${getSourceLabel(item.sourceUrl)}`;

  return (
    <Card className={`flex min-h-56 flex-col overflow-hidden border-dashed shadow-none ${failed ? 'border-[var(--destructive)]/40' : 'border-[var(--primary)]/40'}`}>
      <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Badge variant={failed ? 'warning' : 'default'}>{failed ? 'Import failed' : item.state === 'queued' ? 'Queued' : 'Adding to library'}</Badge>
          {failed ? <CircleAlert className="text-[var(--destructive)]" size={18} /> : <LoaderCircle className="animate-spin text-[var(--primary)]" size={18} />}
        </div>
        <h3 className="mt-5 font-display text-xl font-semibold leading-tight tracking-tight">{title}</h3>
        <p className="mt-2 truncate text-sm text-[var(--muted-foreground)]">
          {item.sourceUrl ?? item.sourceText ?? 'Pasted recipe text'}
        </p>
        {item.submissionId === null ? (
          <p className={`mt-auto pt-6 text-sm ${failed ? 'text-[var(--destructive)]' : 'text-[var(--muted-foreground)]'}`}>
            {item.message ?? 'Creating the import job…'}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
