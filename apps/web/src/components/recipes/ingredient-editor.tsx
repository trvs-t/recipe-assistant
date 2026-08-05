import { useEffect, useState, type ChangeEvent, type ReactElement } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recipeQueryKeys } from '@/features/recipes/queries';
import {
  ingredientToFormValues,
  parseIngredientFormValues,
  variationToFormValues,
  type IIngredientFormValues,
} from '@/features/recipes/ingredient-editing';
import {
  supabaseAdapter,
  type IIngredientVariationInput,
} from '@/lib/supabase';

import type { IIngredientEditInput, IRecipe, IRecipeIngredient } from '@/features/recipes/contracts';

export interface IIngredientEditorProps {
  recipe: IRecipe;
}

interface IUpdateIngredientVariables {
  ingredientId: string;
  input: IIngredientEditInput;
}

interface IAddVariationVariables {
  input: IIngredientVariationInput;
}

export function IngredientEditor({ recipe }: IIngredientEditorProps): ReactElement {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, IIngredientFormValues>>(() => createDrafts(recipe.ingredients));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [variationSourceId, setVariationSourceId] = useState<string | null>(null);
  const [variationDraft, setVariationDraft] = useState<IIngredientFormValues | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect((): void => {
    setDrafts(createDrafts(recipe.ingredients));
    setFormErrors({});
    setVariationSourceId(null);
    setVariationDraft(null);
    setNotice(null);
  }, [recipe.id, recipe.ingredients]);

  const updateMutation = useMutation<void, Error, IUpdateIngredientVariables>({
    mutationFn: (variables: IUpdateIngredientVariables): Promise<void> =>
      supabaseAdapter.updateIngredient(recipe.id, variables.ingredientId, variables.input),
    onSuccess: (): void => {
      setNotice('Ingredient saved.');
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.detail(recipe.id) });
    },
  });

  const variationMutation = useMutation<void, Error, IAddVariationVariables>({
    mutationFn: (variables: IAddVariationVariables): Promise<void> =>
      supabaseAdapter.addIngredientVariation(recipe.id, variables.input),
    onSuccess: (): void => {
      setNotice('Ingredient variation added.');
      setVariationSourceId(null);
      setVariationDraft(null);
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.detail(recipe.id) });
    },
  });

  const updateDraft = (
    ingredientId: string,
    field: keyof IIngredientFormValues,
    value: string,
  ): void => {
    setDrafts((currentDrafts: Record<string, IIngredientFormValues>): Record<string, IIngredientFormValues> => {
      const currentDraft: IIngredientFormValues = currentDrafts[ingredientId] ?? {
        name: '',
        amount: '',
        unit: '',
        note: '',
      };
      return {
        ...currentDrafts,
        [ingredientId]: { ...currentDraft, [field]: value },
      };
    });
    setFormErrors((currentErrors: Record<string, string>): Record<string, string> => {
      const nextErrors: Record<string, string> = { ...currentErrors };
      delete nextErrors[ingredientId];
      return nextErrors;
    });
    setNotice(null);
  };

  const saveIngredient = (ingredient: IRecipeIngredient): void => {
    const draft: IIngredientFormValues = drafts[ingredient.id] ?? ingredientToFormValues(ingredient);
    const parsed = parseIngredientFormValues(draft);
    if (parsed.input === null || parsed.error !== null) {
      setFormErrors((currentErrors: Record<string, string>): Record<string, string> => ({
        ...currentErrors,
        [ingredient.id]: parsed.error ?? 'Check the ingredient fields.',
      }));
      return;
    }

    setNotice(null);
    updateMutation.mutate({ ingredientId: ingredient.id, input: parsed.input });
  };

  const openVariation = (ingredient: IRecipeIngredient): void => {
    setVariationSourceId(ingredient.id);
    setVariationDraft(variationToFormValues(ingredient));
    setNotice(null);
    variationMutation.reset();
  };

  const cancelVariation = (): void => {
    setVariationSourceId(null);
    setVariationDraft(null);
    variationMutation.reset();
  };

  const updateVariationDraft = (field: keyof IIngredientFormValues, value: string): void => {
    setVariationDraft((currentDraft: IIngredientFormValues | null): IIngredientFormValues | null => (
      currentDraft === null ? null : { ...currentDraft, [field]: value }
    ));
    setNotice(null);
  };

  const addVariation = (): void => {
    if (variationSourceId === null || variationDraft === null) {
      return;
    }

    const parsed = parseIngredientFormValues(variationDraft);
    if (parsed.input === null || parsed.error !== null) {
      setNotice(parsed.error ?? 'Check the variation fields.');
      return;
    }

    variationMutation.mutate({
      input: {
        ...parsed.input,
        variationOfId: variationSourceId,
      },
    });
  };

  const mutationError: Error | null = updateMutation.error ?? variationMutation.error ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          <Pencil size={15} />
          Ingredient notes
        </div>
        <CardTitle>Make the recipe yours</CardTitle>
        <CardDescription>Edit names or amounts, or add an alternative without losing the original ingredient.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recipe.ingredients.map((ingredient: IRecipeIngredient): ReactElement => {
            const draft: IIngredientFormValues = drafts[ingredient.id] ?? ingredientToFormValues(ingredient);
            const isSaving: boolean = updateMutation.isPending && updateMutation.variables?.ingredientId === ingredient.id;
            const isVariationSource: boolean = variationSourceId === ingredient.id;

            return (
              <div className="rounded-xl border border-[var(--border)] p-4" key={ingredient.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                      {ingredient.variationOfId === undefined || ingredient.variationOfId === null ? 'Ingredient' : 'Variation'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">Edit the saved ingredient details.</p>
                  </div>
                  <Button
                    aria-label={`Add variation for ${ingredient.name}`}
                    disabled={updateMutation.isPending || variationMutation.isPending}
                    onClick={(): void => openVariation(ingredient)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus size={15} />
                    Add variation
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(6rem,0.7fr)_minmax(6rem,0.8fr)]">
                  <div>
                    <Label htmlFor={`ingredient-name-${ingredient.id}`}>Name</Label>
                    <Input
                      className="mt-1.5"
                      id={`ingredient-name-${ingredient.id}`}
                      onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient.id, 'name', event.target.value)}
                      value={draft.name}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ingredient-amount-${ingredient.id}`}>Amount</Label>
                    <Input
                      className="mt-1.5"
                      id={`ingredient-amount-${ingredient.id}`}
                      min="0"
                      onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient.id, 'amount', event.target.value)}
                      step="any"
                      type="number"
                      value={draft.amount}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ingredient-unit-${ingredient.id}`}>Unit</Label>
                    <Input
                      className="mt-1.5"
                      id={`ingredient-unit-${ingredient.id}`}
                      onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient.id, 'unit', event.target.value)}
                      placeholder="e.g. cups"
                      value={draft.unit}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label htmlFor={`ingredient-note-${ingredient.id}`}>Note</Label>
                  <Input
                    className="mt-1.5"
                    id={`ingredient-note-${ingredient.id}`}
                    onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient.id, 'note', event.target.value)}
                    placeholder="Optional preparation note"
                    value={draft.note}
                  />
                </div>
                {formErrors[ingredient.id] !== undefined ? (
                  <p className="mt-2 text-sm text-[var(--destructive)]">{formErrors[ingredient.id]}</p>
                ) : null}
                <div className="mt-4 flex justify-end">
                  <Button
                    disabled={updateMutation.isPending || variationMutation.isPending}
                    onClick={(): void => saveIngredient(ingredient)}
                    size="sm"
                    type="button"
                  >
                    <Save size={15} />
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>

                {isVariationSource && variationDraft !== null ? (
                  <div className="mt-4 rounded-xl bg-[var(--primary-soft)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">Add a variation</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">The amount starts with the original value so you only need to change what differs.</p>
                      </div>
                      <Button aria-label="Cancel variation" onClick={cancelVariation} size="icon" type="button" variant="ghost">
                        <X size={16} />
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(6rem,0.7fr)_minmax(6rem,0.8fr)]">
                      <div>
                        <Label htmlFor={`variation-name-${ingredient.id}`}>Variation name</Label>
                        <Input
                          className="mt-1.5"
                          id={`variation-name-${ingredient.id}`}
                          onChange={(event: ChangeEvent<HTMLInputElement>): void => updateVariationDraft('name', event.target.value)}
                          value={variationDraft.name}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`variation-amount-${ingredient.id}`}>Amount</Label>
                        <Input
                          className="mt-1.5"
                          id={`variation-amount-${ingredient.id}`}
                          min="0"
                          onChange={(event: ChangeEvent<HTMLInputElement>): void => updateVariationDraft('amount', event.target.value)}
                          step="any"
                          type="number"
                          value={variationDraft.amount}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`variation-unit-${ingredient.id}`}>Unit</Label>
                        <Input
                          className="mt-1.5"
                          id={`variation-unit-${ingredient.id}`}
                          onChange={(event: ChangeEvent<HTMLInputElement>): void => updateVariationDraft('unit', event.target.value)}
                          value={variationDraft.unit}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label htmlFor={`variation-note-${ingredient.id}`}>Note</Label>
                      <Input
                        className="mt-1.5"
                        id={`variation-note-${ingredient.id}`}
                        onChange={(event: ChangeEvent<HTMLInputElement>): void => updateVariationDraft('note', event.target.value)}
                        placeholder="Optional preparation note"
                        value={variationDraft.note}
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        disabled={variationMutation.isPending || updateMutation.isPending}
                        onClick={addVariation}
                        size="sm"
                        type="button"
                      >
                        <Check size={15} />
                        {variationMutation.isPending ? 'Adding…' : 'Add variation'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {mutationError !== null ? <p className="mt-4 text-sm text-[var(--destructive)]">{mutationError.message}</p> : null}
        {notice !== null && mutationError === null ? <p className="mt-4 text-sm text-[var(--primary)]">{notice}</p> : null}
      </CardContent>
    </Card>
  );
}

function createDrafts(ingredients: readonly IRecipeIngredient[]): Record<string, IIngredientFormValues> {
  const drafts: Record<string, IIngredientFormValues> = {};
  for (const ingredient of ingredients) {
    drafts[ingredient.id] = ingredientToFormValues(ingredient);
  }
  return drafts;
}
