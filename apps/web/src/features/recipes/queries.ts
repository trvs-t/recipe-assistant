import { useQuery, type Query, type QueryKey, type UseQueryResult } from '@tanstack/react-query';

import {
  isTerminalImportStatus,
  supabaseAdapter,
  type IImportSubmission,
} from '@/lib/supabase';

import type {
  IRecipe,
  IRecipeSummary,
} from './contracts';

export const recipeQueryKeys = {
  all: ['recipes'] as const,
  list: () => [...recipeQueryKeys.all, 'list'] as const,
  detail: (recipeId: string) => [...recipeQueryKeys.all, 'detail', recipeId] as const,
  imports: ['imports'] as const,
  importList: () => [...recipeQueryKeys.imports, 'list'] as const,
  submission: (submissionId: string) => [...recipeQueryKeys.imports, 'submission', submissionId] as const,
};

export function useRecipeListQuery(): UseQueryResult<IRecipeSummary[], Error> {
  return useQuery<IRecipeSummary[], Error>({
    queryKey: recipeQueryKeys.list(),
    queryFn: (): Promise<IRecipeSummary[]> => supabaseAdapter.listRecipes(),
  });
}

function shouldPollImportList(
  query: Query<IImportSubmission[], Error, IImportSubmission[], QueryKey>,
): number | false {
  const submissions: IImportSubmission[] = query.state.data ?? [];
  return submissions.some((submission: IImportSubmission): boolean => !isTerminalImportStatus(submission.status))
    ? 3_000
    : false;
}

export function useImportSubmissionListQuery(): UseQueryResult<IImportSubmission[], Error> {
  return useQuery<IImportSubmission[], Error>({
    queryKey: recipeQueryKeys.importList(),
    queryFn: (): Promise<IImportSubmission[]> => supabaseAdapter.listImportSubmissions(),
    refetchInterval: shouldPollImportList,
  });
}

export function useRecipeQuery(recipeId: string): UseQueryResult<IRecipe | null, Error> {
  return useQuery<IRecipe | null, Error>({
    queryKey: recipeQueryKeys.detail(recipeId),
    queryFn: (): Promise<IRecipe | null> => supabaseAdapter.getRecipe(recipeId),
    enabled: recipeId.length > 0,
  });
}

function shouldPollSubmission(
  query: Query<IImportSubmission | null, Error, IImportSubmission | null, QueryKey>,
): number | false {
  const submission: IImportSubmission | null | undefined = query.state.data;
  return submission !== null && submission !== undefined && !isTerminalImportStatus(submission.status)
    ? 3_000
    : false;
}

export function useImportSubmissionQuery(
  submissionId: string,
): UseQueryResult<IImportSubmission | null, Error> {
  return useQuery<IImportSubmission | null, Error>({
    queryKey: recipeQueryKeys.submission(submissionId),
    queryFn: (): Promise<IImportSubmission | null> => supabaseAdapter.getImportSubmission(submissionId),
    enabled: submissionId.length > 0,
    refetchInterval: shouldPollSubmission,
  });
}
