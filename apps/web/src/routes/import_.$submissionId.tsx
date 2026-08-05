import { useEffect, type ReactElement } from 'react';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, LoaderCircle } from 'lucide-react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';

import { ImportRecoveryPanel } from '@/components/recipes/import-recovery-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { recipeQueryKeys, useImportSubmissionQuery } from '@/features/recipes/queries';
import { formatDate, getSourceLabel } from '@/lib/format';
import {
  createImportIdempotencyKey,
  isTerminalImportStatus,
  supabaseAdapter,
  type IImportSubmission,
  type IImportRequestWithIdempotencyKey,
  type ImportJobStatus,
} from '@/lib/supabase';

export const Route = createFileRoute('/import_/$submissionId')({
  component: ImportStatusPage,
});

interface IStatusStep {
  status: ImportJobStatus;
  label: string;
  description: string;
}

const statusSteps: readonly IStatusStep[] = [
  { status: 'queued', label: 'Queued', description: 'The source is waiting to be processed.' },
  { status: 'fetching', label: 'Fetching source', description: 'The importer is checking the source page.' },
  { status: 'extracting', label: 'Extracting recipe', description: 'Recipe structure is being found in the page.' },
  { status: 'normalizing', label: 'Normalizing recipe', description: 'Ingredients and steps are being cleaned up.' },
  { status: 'validating', label: 'Validating recipe', description: 'The imported structure is being checked.' },
  { status: 'persisting', label: 'Saving recipe', description: 'The recipe is being saved to your library.' },
  { status: 'retry_wait', label: 'Waiting to retry', description: 'A temporary issue will be retried automatically.' },
];

function ImportStatusPage(): ReactElement {
  const { submissionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient: QueryClient = useQueryClient();
  const submissionQuery = useImportSubmissionQuery(submissionId);
  const retryImportMutation = useMutation<IImportSubmission, Error, string>({
    mutationFn: (sourceUrl: string): Promise<IImportSubmission> => {
      const request: IImportRequestWithIdempotencyKey = {
        sourceUrl,
        idempotencyKey: createImportIdempotencyKey(),
      };
      return supabaseAdapter.submitImport(request);
    },
  });
  const submissionForInvalidation: IImportSubmission | null | undefined = submissionQuery.data;
  const completedRecipeId: string | null = submissionForInvalidation !== undefined
    && submissionForInvalidation !== null
    && (submissionForInvalidation.status === 'completed' || submissionForInvalidation.status === 'parsed')
    ? submissionForInvalidation.recipeId
    : null;

  useEffect((): void => {
    if (completedRecipeId !== null) {
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.all });
    }
    if (completedRecipeId !== null || submissionForInvalidation?.status === 'failed' || submissionForInvalidation?.status === 'needs_input') {
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.imports });
    }
  }, [completedRecipeId, queryClient, submissionForInvalidation?.status]);

  if (submissionQuery.isPending) {
    return <StatusLoading />;
  }

  const submissionData: IImportSubmission | null | undefined = submissionQuery.data;
  if (submissionData === undefined) {
    const queryErrorMessage: string = submissionQuery.error instanceof Error
      ? submissionQuery.error.message
      : 'Try submitting the URL again.';

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ImportRecoveryPanel
          isActionPending={submissionQuery.isFetching}
          message={queryErrorMessage}
          onTryAgain={(): void => {
            void submissionQuery.refetch();
          }}
          state="query_error"
        />
        <Link className="inline-block" to="/">
          <Button variant="outline">Back to library</Button>
        </Link>
      </div>
    );
  }

  const submission: IImportSubmission | null = submissionData;
  if (submission === null) {
    return (
      <Card className="mx-auto max-w-2xl p-6">
        <Badge variant="secondary">Import not found</Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold">That import has expired.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Start a new import to put a recipe in your library.</p>
        <Link className="mt-6 inline-block" to="/">
          <Button>Import another recipe</Button>
        </Link>
      </Card>
    );
  }

  const completed: boolean = submission.status === 'completed' || submission.status === 'parsed';
  const needsInput: boolean = submission.status === 'needs_input';
  const failed: boolean = submission.status === 'failed' || submission.status === 'error';
  const completedWithoutRecipe: boolean = completed && submission.recipeId === null;
  const currentStepIndex: number = completed
    ? statusSteps.length
    : submission.status === 'pending'
      ? 0
      : submission.status === 'parsing'
        ? 1
        : statusSteps.findIndex((step: IStatusStep): boolean => step.status === submission.status);
  const terminal: boolean = isTerminalImportStatus(submission.status);
  const canOpenRecipe: boolean = completed && submission.recipeId !== null;
  const refreshError: string | null = submissionQuery.isError && submissionQuery.error instanceof Error
    ? submissionQuery.error.message
    : null;
  const recoveryActionError: string | null = retryImportMutation.error?.message ?? refreshError;
  const statusMessage: string = failed
    ? 'The importer stopped before a recipe could be saved. Review the error below, then retry or correct the source URL.'
    : needsInput
      ? 'The source did not contain enough usable recipe detail. Review the guidance below, then retry or correct the URL.'
      : submission.message;

  const handleRefresh: () => void = (): void => {
    void submissionQuery.refetch();
  };

  const handleRetryImport: () => void = (): void => {
    retryImportMutation.mutate(submission.sourceUrl, {
      onSuccess: (newSubmission: IImportSubmission): void => {
        void navigate({
          to: '/import/$submissionId',
          params: { submissionId: newSubmission.id },
        });
      },
    });
  };

  const handleEditSource: () => void = (): void => {
    void navigate({
      to: '/',
      search: { sourceUrl: submission.sourceUrl },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]" to="/">
        <ArrowLeft size={16} />
        Back to library
      </Link>
      <section>
        <Badge variant={failed || needsInput ? 'warning' : completed ? 'success' : 'default'}>
          {failed ? 'Import failed' : needsInput ? 'Needs more input' : completed ? 'Import complete' : 'Import in progress'}
        </Badge>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">We have the link. Now we make it useful.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">{statusMessage}</p>
      </section>

      <Card>
        <CardHeader className="border-b border-[var(--border)] bg-[var(--card-muted)]">
          <CardTitle className="flex items-center justify-between gap-4 text-lg">
            <span className="truncate">{getSourceLabel(submission.sourceUrl)}</span>
            <span className="text-xs font-normal text-[var(--muted-foreground)]">Submitted {formatDate(submission.submittedAt)}</span>
          </CardTitle>
          {submission.sourceUrl.length > 0 ? (
            <a
              className="inline-flex items-center gap-1.5 truncate text-sm text-[var(--primary)] hover:underline"
              href={submission.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {submission.sourceUrl}
              <ExternalLink className="shrink-0" size={14} />
            </a>
          ) : null}
        </CardHeader>
        <CardContent className="p-5 sm:p-8">
          <ol className="space-y-6">
            {statusSteps.map((step: IStatusStep, index: number): ReactElement => {
              const isComplete: boolean = completed || (!terminal && currentStepIndex > index);
              const isCurrent: boolean = !terminal && currentStepIndex === index;

              return (
                <li className="flex gap-4" key={step.status}>
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isComplete ? 'bg-[var(--primary)] text-white' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
                    {isCurrent ? <LoaderCircle className="animate-spin" size={16} /> : isComplete ? <Check size={16} /> : index + 1}
                  </span>
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      {step.label}
                      {isCurrent ? <Badge className="py-0.5" variant="default">Now</Badge> : null}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[var(--muted-foreground)]">{step.description}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {submission.status === 'retry_wait' ? (
        <ImportRecoveryPanel
          actionError={recoveryActionError}
          isActionPending={submissionQuery.isFetching}
          message={submission.message}
          nextAttemptAt={submission.nextAttemptAt}
          onCheckNow={handleRefresh}
          state="retry_wait"
        />
      ) : null}

      {needsInput ? (
        <ImportRecoveryPanel
          actionError={recoveryActionError}
          errorCode={submission.errorCode}
          isActionPending={retryImportMutation.isPending}
          message={submission.message}
          onEditSource={handleEditSource}
          onRetryImport={handleRetryImport}
          state="needs_input"
        />
      ) : null}

      {failed ? (
        <ImportRecoveryPanel
          actionError={recoveryActionError}
          errorCode={submission.errorCode}
          isActionPending={retryImportMutation.isPending}
          message={submission.message}
          onEditSource={handleEditSource}
          onRetryImport={handleRetryImport}
          state="failed"
        />
      ) : null}

      {canOpenRecipe && submission.recipeId !== null ? (
        <Link to="/recipes/$recipeId" params={{ recipeId: submission.recipeId }}>
          <Button>Open recipe</Button>
        </Link>
      ) : completedWithoutRecipe ? (
        <ImportRecoveryPanel
          actionError={recoveryActionError}
          isActionPending={submissionQuery.isFetching}
          message={submission.message}
          onCheckAgain={handleRefresh}
          state="completed_without_recipe"
        />
      ) : supabaseAdapter.mode === 'demo' ? (
        <Card className="border-dashed bg-[var(--card-muted)]">
          <CardContent className="p-5 text-sm leading-6 text-[var(--muted-foreground)]">
            Demo mode keeps this submission local. Add Supabase keys to connect the durable importer.
          </CardContent>
        </Card>
      ) : terminal ? null : (
        <Card className="border-dashed bg-[var(--card-muted)]">
          <CardContent className="p-5 text-sm leading-6 text-[var(--muted-foreground)]">
            This page will keep checking the import job until it reaches a terminal status.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusLoading(): ReactElement {
  return (
    <Card className="mx-auto max-w-2xl animate-pulse p-6">
      <div className="h-4 w-28 rounded bg-[var(--muted)]" />
      <div className="mt-5 h-10 w-4/5 rounded bg-[var(--muted)]" />
      <div className="mt-4 h-20 rounded bg-[var(--muted)]" />
    </Card>
  );
}
