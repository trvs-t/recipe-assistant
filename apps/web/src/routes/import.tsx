import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';

import { ArrowRight, CircleAlert, CircleCheck, Link2, LockKeyhole, ScanSearch, WandSparkles } from 'lucide-react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';

import { RecipeFlow } from '@/components/recipes/recipe-flow';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createImportIdempotencyKey,
  supabaseAdapter,
  type IImportRequestWithIdempotencyKey,
  type IImportSubmission,
} from '@/lib/supabase';
import { getSourceLabel, MAX_BULK_IMPORT_URLS, parseSourceUrls, type IParsedSourceUrls } from '@/lib/format';

export interface IImportSearch {
  sourceUrl?: string;
}

export function validateImportSearch(search: Record<string, unknown>): IImportSearch {
  const sourceUrl: unknown = search['sourceUrl'];
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
    return {};
  }

  return { sourceUrl: sourceUrl.trim() };
}

export const Route = createFileRoute('/import')({
  validateSearch: (search: Record<string, unknown>): IImportSearch => validateImportSearch(search),
  component: ImportPage,
});

interface IImportFailure {
  sourceUrl: string;
  message: string;
}

interface IBulkImportResult {
  submissions: IImportSubmission[];
  failures: IImportFailure[];
}

type ImportAttempt =
  | { succeeded: true; submission: IImportSubmission }
  | { succeeded: false; failure: IImportFailure };

async function submitImports(sourceUrls: string[]): Promise<IBulkImportResult> {
  const attempts: ImportAttempt[] = await Promise.all(
    sourceUrls.map(async (sourceUrl: string): Promise<ImportAttempt> => {
      const request: IImportRequestWithIdempotencyKey = {
        sourceUrl,
        idempotencyKey: createImportIdempotencyKey(),
      };

      try {
        const submission: IImportSubmission = await supabaseAdapter.submitImport(request);
        return { succeeded: true, submission };
      } catch (error: unknown) {
        return {
          succeeded: false,
          failure: {
            sourceUrl,
            message: error instanceof Error ? error.message : 'The recipe import could not be submitted.',
          },
        };
      }
    }),
  );

  const submissions: IImportSubmission[] = [];
  const failures: IImportFailure[] = [];
  for (const attempt of attempts) {
    if (attempt.succeeded) {
      submissions.push(attempt.submission);
    } else {
      failures.push(attempt.failure);
    }
  }

  return { submissions, failures };
}

function ImportPage(): ReactElement {
  const navigate = useNavigate();
  const { sourceUrl: sourceUrlFromSearch } = Route.useSearch();
  const [sourceUrls, setSourceUrls] = useState<string>(sourceUrlFromSearch ?? '');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const importMutation = useMutation<IBulkImportResult, Error, string[]>({
    mutationFn: submitImports,
  });

  useEffect((): void => {
    setSourceUrls(sourceUrlFromSearch ?? '');
    setValidationMessage(null);
    importMutation.reset();
  }, [sourceUrlFromSearch]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
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

    const result: IBulkImportResult = await importMutation.mutateAsync(parsed.urls);
    if (parsed.urls.length === 1 && result.submissions.length === 1) {
      await navigate({
        to: '/import/$submissionId',
        params: { submissionId: result.submissions[0].id },
      });
    }
  };

  const errorMessage: string | null = validationMessage ?? (importMutation.error?.message ?? null);
  const candidateCount: number = parseSourceUrls(sourceUrls).urls.length;

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
        <div>
          <Badge className="mb-5" variant="default">
            <Link2 className="mr-1.5" size={13} />
            URL import
          </Badge>
          <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Bring the recipe tab home.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">
            Paste one or more public recipe links. The importer will validate each source, find the recipe structure, and return clean cooking flows.
          </p>
        </div>
        <Card className="bg-[var(--primary-soft)]/45">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">How it works</span>
              <LockKeyhole className="text-[var(--primary)]" size={17} />
            </div>
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">
              Your source URL stays attached to the saved recipe, so the original page is always one click away.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--border)] bg-[var(--card-muted)]">
          <CardTitle>Paste recipe URLs</CardTitle>
          <p className="text-sm text-[var(--muted-foreground)]">Add one link per line, up to {MAX_BULK_IMPORT_URLS} recipes at a time.</p>
        </CardHeader>
        <CardContent className="p-5 sm:p-8">
          <form className="space-y-5" onSubmit={(event: FormEvent<HTMLFormElement>): void => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="source-urls">Recipe URLs</Label>
              <div className="space-y-3">
                <Textarea
                  aria-describedby={errorMessage !== null ? 'source-urls-message' : 'source-urls-hint'}
                  aria-invalid={errorMessage !== null}
                  className="min-h-36 font-mono leading-6"
                  id="source-urls"
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
                    setSourceUrls(event.target.value);
                    setValidationMessage(null);
                    importMutation.reset();
                  }}
                  placeholder={'https://your-favorite-site.com/recipe\nhttps://another-site.com/dinner'}
                  value={sourceUrls}
                />
                <Button className="h-13 w-full sm:w-auto sm:min-w-40" disabled={importMutation.isPending} size="lg" type="submit">
                  {importMutation.isPending
                    ? `Submitting ${candidateCount > 1 ? `${candidateCount} recipes` : 'recipe'}…`
                    : candidateCount > 1
                      ? `Import ${candidateCount} recipes`
                      : 'Import recipe'}
                  <ArrowRight size={17} />
                </Button>
              </div>
              {errorMessage !== null ? (
                <p className="text-sm text-[var(--destructive)]" id="source-urls-message">
                  {errorMessage}
                </p>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]" id="source-urls-hint">
                  URLs are extracted in your browser. If other text would be ignored, you will be asked to confirm.
                </p>
              )}
            </div>
            <button
              className="text-left text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
              onClick={(): void => {
                setSourceUrls('https://www.justonecookbook.com/miso-salmon/');
                setValidationMessage(null);
                importMutation.reset();
              }}
              type="button"
            >
              Use a sample recipe URL
            </button>
          </form>

          {importMutation.data !== undefined ? <BulkImportResults result={importMutation.data} /> : null}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
            <ScanSearch size={17} />
            <span>Import pipeline</span>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">From noisy page to dinner-ready flow.</h2>
        </div>
        <RecipeFlow />
        <div className="grid gap-4 pt-2 md:grid-cols-3">
          <FeaturePlaceholder icon={<ScanSearch size={18} />} title="Source detection" text="Schema.org recipes are parsed first, with an AI fallback for unstructured pages." />
          <FeaturePlaceholder icon={<WandSparkles size={18} />} title="Portion scaling" text="Normalized quantities make serving changes predictable." />
          <FeaturePlaceholder icon={<LockKeyhole size={18} />} title="Source traceability" text="Keep the original page linked to every imported recipe." />
        </div>
      </section>
    </div>
  );
}

function BulkImportResults({ result }: { result: IBulkImportResult }): ReactElement {
  const totalCount: number = result.submissions.length + result.failures.length;

  return (
    <div aria-live="polite" className="mt-7 border-t border-[var(--border)] pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Bulk import submitted</h2>
        <Badge variant={result.failures.length === 0 ? 'default' : 'secondary'}>
          {result.submissions.length} of {totalCount} queued
        </Badge>
      </div>
      <div className="space-y-2">
        {result.submissions.map((submission: IImportSubmission): ReactElement => (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-muted)] p-4 sm:flex-row sm:items-center sm:justify-between" key={submission.id}>
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                <CircleCheck className="shrink-0 text-[var(--primary)]" size={17} />
                <span className="truncate">{getSourceLabel(submission.sourceUrl)}</span>
              </p>
              <p className="mt-1 truncate pl-6 text-xs text-[var(--muted-foreground)]">{submission.sourceUrl}</p>
            </div>
            <Link
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
              params={{ submissionId: submission.id }}
              to="/import/$submissionId"
            >
              View status
            </Link>
          </div>
        ))}
        {result.failures.map((failure: IImportFailure): ReactElement => (
          <div className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4" key={failure.sourceUrl}>
            <p className="flex items-center gap-2 font-medium text-[var(--destructive)]">
              <CircleAlert className="shrink-0" size={17} />
              <span className="truncate">{getSourceLabel(failure.sourceUrl)}</span>
            </p>
            <p className="mt-1 pl-6 text-sm text-[var(--muted-foreground)]">{failure.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface IFeaturePlaceholderProps {
  icon: ReactElement;
  title: string;
  text: string;
}

function FeaturePlaceholder({ icon, title, text }: IFeaturePlaceholderProps): ReactElement {
  return (
    <Card className="bg-[var(--card-muted)]">
      <CardContent className="p-5">
        <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
      </CardContent>
    </Card>
  );
}
