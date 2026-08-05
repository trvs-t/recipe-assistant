import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';

import { ArrowRight, Link2, LockKeyhole, ScanSearch, WandSparkles } from 'lucide-react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';

import { RecipeFlow } from '@/components/recipes/recipe-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createImportIdempotencyKey,
  supabaseAdapter,
  type IImportRequestWithIdempotencyKey,
  type IImportSubmission,
} from '@/lib/supabase';
import { validateSourceUrl } from '@/lib/format';

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

function ImportPage(): ReactElement {
  const navigate = useNavigate();
  const { sourceUrl: sourceUrlFromSearch } = Route.useSearch();
  const [sourceUrl, setSourceUrl] = useState<string>(sourceUrlFromSearch ?? '');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const importMutation = useMutation<IImportSubmission, Error, IImportRequestWithIdempotencyKey>({
    mutationFn: (request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission> => supabaseAdapter.submitImport(request),
  });

  useEffect((): void => {
    setSourceUrl(sourceUrlFromSearch ?? '');
    setValidationMessage(null);
    importMutation.reset();
  }, [sourceUrlFromSearch]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const errorMessage: string | null = validateSourceUrl(sourceUrl);
    setValidationMessage(errorMessage);

    if (errorMessage !== null) {
      return;
    }

    const request: IImportRequestWithIdempotencyKey = {
      sourceUrl: sourceUrl.trim(),
      idempotencyKey: createImportIdempotencyKey(),
    };
    const submission: IImportSubmission = await importMutation.mutateAsync(request);
    await navigate({
      to: '/import/$submissionId',
      params: { submissionId: submission.id },
    });
  };

  const errorMessage: string | null = validationMessage ?? (importMutation.error?.message ?? null);

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
            Paste a public recipe link. The importer will validate the source, find the recipe structure, and return a clean cooking flow.
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
          <CardTitle>Start with a URL</CardTitle>
          <p className="text-sm text-[var(--muted-foreground)]">Works with public recipe pages from the open web.</p>
        </CardHeader>
        <CardContent className="p-5 sm:p-8">
          <form className="space-y-5" onSubmit={(event: FormEvent<HTMLFormElement>): void => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="source-url">Recipe URL</Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  aria-describedby={errorMessage !== null ? 'source-url-message' : undefined}
                  aria-invalid={errorMessage !== null}
                  autoComplete="url"
                  className="h-13 flex-1"
                  id="source-url"
                  onChange={(event: ChangeEvent<HTMLInputElement>): void => {
                    setSourceUrl(event.target.value);
                    setValidationMessage(null);
                    importMutation.reset();
                  }}
                  placeholder="https://your-favorite-site.com/recipe"
                  type="url"
                  value={sourceUrl}
                />
                <Button className="h-13 sm:min-w-40" disabled={importMutation.isPending} size="lg" type="submit">
                  {importMutation.isPending ? 'Submitting…' : 'Import recipe'}
                  <ArrowRight size={17} />
                </Button>
              </div>
              {errorMessage !== null ? (
                <p className="text-sm text-[var(--destructive)]" id="source-url-message">
                  {errorMessage}
                </p>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">Try the sample URL below while running in demo mode.</p>
              )}
            </div>
            <button
              className="text-left text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
              onClick={(): void => {
                setSourceUrl('https://www.justonecookbook.com/miso-salmon/');
                setValidationMessage(null);
              }}
              type="button"
            >
              Use a sample recipe URL
            </button>
          </form>
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
