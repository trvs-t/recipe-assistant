import type { ReactElement } from 'react';

import { CircleAlert, Clock3, Pencil, RefreshCw, SearchCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type ImportRecoveryState =
  | 'retry_wait'
  | 'needs_input'
  | 'failed'
  | 'query_error'
  | 'completed_without_recipe';

interface IImportRecoveryPanelBaseProps {
  message: string;
  isActionPending?: boolean;
  actionError?: string | null;
}

export interface IRetryWaitRecoveryPanelProps extends IImportRecoveryPanelBaseProps {
  state: 'retry_wait';
  nextAttemptAt: string | null;
  onCheckNow: () => void;
}

export interface INeedsInputRecoveryPanelProps extends IImportRecoveryPanelBaseProps {
  state: 'needs_input';
  errorCode: string | null;
  onEditSource: () => void;
  onRetryImport: () => void;
}

export interface IFailedRecoveryPanelProps extends IImportRecoveryPanelBaseProps {
  state: 'failed';
  errorCode: string | null;
  onEditSource: () => void;
  onRetryImport: () => void;
}

export interface IQueryErrorRecoveryPanelProps extends IImportRecoveryPanelBaseProps {
  state: 'query_error';
  onTryAgain: () => void;
}

export interface ICompletedWithoutRecipeRecoveryPanelProps extends IImportRecoveryPanelBaseProps {
  state: 'completed_without_recipe';
  onCheckAgain: () => void;
}

export type IImportRecoveryPanelProps =
  | IRetryWaitRecoveryPanelProps
  | INeedsInputRecoveryPanelProps
  | IFailedRecoveryPanelProps
  | IQueryErrorRecoveryPanelProps
  | ICompletedWithoutRecipeRecoveryPanelProps;

interface IRecoveryContent {
  title: string;
  description: string;
  icon: ReactElement;
  tone: 'primary' | 'warning' | 'destructive' | 'neutral';
}

export function ImportRecoveryPanel(props: IImportRecoveryPanelProps): ReactElement {
  const content: IRecoveryContent = getRecoveryContent(props);
  const role: 'alert' | 'status' = props.state === 'query_error' || props.state === 'failed' || props.state === 'needs_input'
    ? 'alert'
    : 'status';

  return (
    <Card aria-live="polite" className={getCardClassName(content.tone)} role={role}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex gap-3">
          <span className={getIconClassName(content.tone)}>{content.icon}</span>
          <div className="min-w-0 flex-1">
            {props.state === 'query_error' ? (
              <h1 className="font-display text-3xl font-semibold tracking-tight">{content.title}</h1>
            ) : (
              <h2 className="font-semibold">{content.title}</h2>
            )}
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{content.description}</p>
            {props.state === 'retry_wait' ? <RetryTiming nextAttemptAt={props.nextAttemptAt} /> : null}
            {props.state === 'needs_input' || props.state === 'failed' ? (
              <>
                <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{props.message}</p>
                {props.errorCode !== null ? (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">Code: {props.errorCode}</p>
                ) : null}
              </>
            ) : props.state === 'query_error' ? (
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{props.message}</p>
            ) : null}
            {props.actionError !== null && props.actionError !== undefined ? (
              <p aria-live="assertive" className="mt-3 text-sm text-[var(--destructive)]">
                {props.actionError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              {props.state === 'retry_wait' ? (
                <Button disabled={props.isActionPending} onClick={props.onCheckNow} type="button">
                  <RefreshCw aria-hidden="true" className={props.isActionPending ? 'animate-spin' : undefined} size={16} />
                  {props.isActionPending ? 'Checking…' : 'Check now'}
                </Button>
              ) : null}
              {props.state === 'needs_input' || props.state === 'failed' ? (
                <>
                  <Button disabled={props.isActionPending} onClick={props.onRetryImport} type="button">
                    <RefreshCw aria-hidden="true" className={props.isActionPending ? 'animate-spin' : undefined} size={16} />
                    {props.isActionPending ? 'Retrying…' : 'Retry import'}
                  </Button>
                  <Button disabled={props.isActionPending} onClick={props.onEditSource} type="button" variant="outline">
                    <Pencil aria-hidden="true" size={16} />
                    Edit source URL
                  </Button>
                </>
              ) : null}
              {props.state === 'query_error' ? (
                <Button disabled={props.isActionPending} onClick={props.onTryAgain} type="button" variant="outline">
                  <RefreshCw aria-hidden="true" className={props.isActionPending ? 'animate-spin' : undefined} size={16} />
                  {props.isActionPending ? 'Trying again…' : 'Try again'}
                </Button>
              ) : null}
              {props.state === 'completed_without_recipe' ? (
                <Button disabled={props.isActionPending} onClick={props.onCheckAgain} type="button" variant="outline">
                  <SearchCheck aria-hidden="true" className={props.isActionPending ? 'animate-pulse' : undefined} size={16} />
                  {props.isActionPending ? 'Checking…' : 'Check again'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getRecoveryContent(props: IImportRecoveryPanelProps): IRecoveryContent {
  switch (props.state) {
    case 'retry_wait':
      return {
        title: 'Retry scheduled automatically',
        description: 'A temporary issue interrupted this import. We will try the same source again automatically.',
        icon: <Clock3 aria-hidden="true" size={18} />,
        tone: 'primary',
      };
    case 'needs_input':
      return {
        title: 'The source needs a little more detail',
        description: 'The importer could not produce a usable recipe output from this page. Check that the URL is public and contains ingredients and cooking steps, then edit the source or retry it.',
        icon: <CircleAlert aria-hidden="true" size={18} />,
        tone: 'warning',
      };
    case 'failed':
      return {
        title: 'We could not finish this import',
        description: 'This import reached a terminal error. You can retry the same source or edit the URL before trying again.',
        icon: <CircleAlert aria-hidden="true" size={18} />,
        tone: 'destructive',
      };
    case 'query_error':
      return {
        title: 'We could not read this import',
        description: 'The import status could not be loaded. Try again to check whether the job is still progressing.',
        icon: <CircleAlert aria-hidden="true" size={18} />,
        tone: 'neutral',
      };
    case 'completed_without_recipe':
      return {
        title: 'The import finished, but the recipe is not linked yet',
        description: 'The importer reported completion without a saved recipe id. Check again in case the recipe link is still being finalized.',
        icon: <SearchCheck aria-hidden="true" size={18} />,
        tone: 'neutral',
      };
  }
}

function RetryTiming({ nextAttemptAt }: { nextAttemptAt: string | null }): ReactElement {
  if (nextAttemptAt === null) {
    return <p className="mt-3 text-sm text-[var(--muted-foreground)]">The next automatic attempt is being scheduled.</p>;
  }

  const date: Date = new Date(nextAttemptAt);
  if (Number.isNaN(date.getTime())) {
    return <p className="mt-3 text-sm text-[var(--muted-foreground)]">The next automatic attempt is being scheduled.</p>;
  }

  const formattedDate: string = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

  return (
    <p className="mt-3 text-sm text-[var(--muted-foreground)]">
      Next automatic attempt: <time dateTime={nextAttemptAt}>{formattedDate}</time>.
    </p>
  );
}

function getCardClassName(tone: IRecoveryContent['tone']): string {
  switch (tone) {
    case 'primary':
      return 'border-[var(--primary)]/25 bg-[var(--primary-soft)]/45';
    case 'warning':
      return 'border-[var(--warning)]/30 bg-[var(--warning-soft)]';
    case 'destructive':
      return 'border-[var(--destructive)]/30 bg-[var(--destructive)]/5';
    case 'neutral':
      return 'border-dashed bg-[var(--card-muted)]';
  }
}

function getIconClassName(tone: IRecoveryContent['tone']): string {
  switch (tone) {
    case 'primary':
      return 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]';
    case 'warning':
      return 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]';
    case 'destructive':
      return 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--destructive)]/10 text-[var(--destructive)]';
    case 'neutral':
      return 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]';
  }
}
