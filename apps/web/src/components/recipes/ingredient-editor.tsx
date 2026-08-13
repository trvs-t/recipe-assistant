import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, GitFork, Minus, Plus, RotateCcw, Scale } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { recipeQueryKeys } from '@/features/recipes/queries';
import {
  ingredientToFormValues,
  parseIngredientFormValues,
  variationToFormValues,
  type IIngredientFormValues,
} from '@/features/recipes/ingredient-editing';
import { formatMeasurement, scaleQuantityByFactor } from '@/features/recipes/scaling';
import { supabaseAdapter, type IIngredientVariationInput } from '@/lib/supabase';

import type { IIngredientEditInput, IRecipe, IRecipeIngredient } from '@/features/recipes/contracts';

export interface IIngredientEditorProps {
  onScaleFactorChange?: (scaleFactor: number) => void;
  recipe: IRecipe;
}

interface IUpdateIngredientVariables {
  field: TEditableIngredientField;
  ingredientId: string;
  input: IIngredientEditInput;
}

interface IAddVariationVariables {
  input: IIngredientVariationInput;
  sourceId: string;
}

interface IPendingVariation {
  ingredientId: string;
  sourceId: string;
}

interface IIngredientGroup {
  source: IRecipeIngredient;
  options: IRecipeIngredient[];
}

type TEditableIngredientField = 'name' | 'unit' | 'note';

interface ISavedIndicator {
  field: TEditableIngredientField;
  ingredientId: string;
}

const AUTOSAVE_DELAY_MS: number = 800;
const MIN_SERVINGS: number = 1;
const MAX_SERVINGS: number = 100;

export function IngredientEditor({ onScaleFactorChange, recipe }: IIngredientEditorProps): ReactElement {
  const queryClient = useQueryClient();
  const groups: IIngredientGroup[] = useMemo(
    (): IIngredientGroup[] => groupIngredients(recipe.ingredients),
    [recipe.ingredients],
  );
  const allIngredientIds: Set<string> = useMemo(
    (): Set<string> => new Set(recipe.ingredients.map((ingredient: IRecipeIngredient): string => ingredient.id)),
    [recipe.ingredients],
  );
  const [drafts, setDrafts] = useState<Record<string, IIngredientFormValues>>(
    (): Record<string, IIngredientFormValues> => createDrafts(recipe.ingredients),
  );
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [activeOptions, setActiveOptions] = useState<Record<string, string>>(
    (): Record<string, string> => createActiveOptions(groups),
  );
  const [pendingVariation, setPendingVariation] = useState<IPendingVariation | null>(null);
  const [savedIndicator, setSavedIndicator] = useState<ISavedIndicator | null>(null);
  const [scaleFactor, setScaleFactor] = useState<number>(1);
  const [servingsInput, setServingsInput] = useState<string>(() => formatInputNumber(recipe.servings));
  const [activeAmount, setActiveAmount] = useState<{ ingredientId: string; value: string } | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const nameInputs = useRef<Map<string, HTMLInputElement>>(new Map());

  const updateMutation = useMutation<void, Error, IUpdateIngredientVariables>({
    mutationFn: (variables: IUpdateIngredientVariables): Promise<void> =>
      supabaseAdapter.updateIngredient(recipe.id, variables.ingredientId, variables.input),
    onSuccess: (_data: void, variables: IUpdateIngredientVariables): void => {
      setSavedIndicator({ field: variables.field, ingredientId: variables.ingredientId });
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.detail(recipe.id) });
    },
  });

  const variationMutation = useMutation<string, Error, IAddVariationVariables>({
    mutationFn: (variables: IAddVariationVariables): Promise<string> =>
      supabaseAdapter.addIngredientVariation(recipe.id, variables.input),
    onSuccess: (ingredientId: string, variables: IAddVariationVariables): void => {
      setPendingVariation({ ingredientId, sourceId: variables.sourceId });
      setSavedIndicator(null);
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.detail(recipe.id) });
    },
    onError: (): void => {
      setPendingVariation(null);
    },
  });

  useEffect((): (() => void) => (): void => {
    for (const timer of saveTimers.current.values()) {
      clearTimeout(timer);
    }
  }, []);

  useEffect((): void => {
    setDrafts((currentDrafts: Record<string, IIngredientFormValues>): Record<string, IIngredientFormValues> =>
      mergeDrafts(recipe.ingredients, currentDrafts));
    setActiveOptions((currentOptions: Record<string, string>): Record<string, string> => {
      const nextOptions: Record<string, string> = {};
      for (const group of groups) {
        const currentOption: string | undefined = currentOptions[group.source.id];
        nextOptions[group.source.id] = currentOption !== undefined && allIngredientIds.has(currentOption)
          ? currentOption
          : group.source.id;
      }

      if (pendingVariation !== null && allIngredientIds.has(pendingVariation.ingredientId)) {
        nextOptions[pendingVariation.sourceId] = pendingVariation.ingredientId;
      }
      return nextOptions;
    });
    if (pendingVariation !== null && allIngredientIds.has(pendingVariation.ingredientId)) {
      setPendingVariation(null);
      window.setTimeout((): void => {
        const nameInput: HTMLInputElement | undefined = nameInputs.current.get(pendingVariation.ingredientId);
        nameInput?.focus();
        nameInput?.select();
      }, 0);
    }
  }, [allIngredientIds, groups, pendingVariation, recipe.ingredients]);

  useEffect((): void => {
    setScaleFactor(1);
    setServingsInput(formatInputNumber(recipe.servings));
    setActiveAmount(null);
    setSavedIndicator(null);
  }, [recipe.id, recipe.servings]);

  useEffect((): void => {
    onScaleFactorChange?.(scaleFactor);
  }, [onScaleFactorChange, scaleFactor]);

  const desiredServings: number = recipe.servings * scaleFactor;
  const mutationError: Error | null = updateMutation.error ?? variationMutation.error ?? null;

  const commitIngredient = (
    ingredient: IRecipeIngredient,
    field: TEditableIngredientField,
    draftOverride?: IIngredientFormValues,
  ): void => {
    clearSaveTimer(ingredient.id, saveTimers.current);
    const draft: IIngredientFormValues = draftOverride ?? drafts[ingredient.id] ?? ingredientToFormValues(ingredient);
    const parsed = parseIngredientFormValues({
      ...draft,
      amount: ingredient.quantity === null ? '' : ingredient.quantity.toString(),
    });
    if (parsed.input === null || parsed.error !== null) {
      setFormErrors((currentErrors: Record<string, string>): Record<string, string> => ({
        ...currentErrors,
        [ingredient.id]: parsed.error ?? 'Check the ingredient fields.',
      }));
      return;
    }
    if (ingredientMatchesInput(ingredient, parsed.input)) {
      return;
    }
    setSavedIndicator(null);
    updateMutation.mutate({ field, ingredientId: ingredient.id, input: parsed.input });
  };

  const updateDraft = (
    ingredient: IRecipeIngredient,
    field: TEditableIngredientField,
    value: string,
  ): void => {
    const currentDraft: IIngredientFormValues = drafts[ingredient.id] ?? ingredientToFormValues(ingredient);
    const nextDraft: IIngredientFormValues = { ...currentDraft, [field]: value };
    if (savedIndicator?.ingredientId === ingredient.id) {
      setSavedIndicator(null);
    }
    setDrafts((currentDrafts: Record<string, IIngredientFormValues>): Record<string, IIngredientFormValues> => ({
      ...currentDrafts,
      [ingredient.id]: nextDraft,
    }));
    setFormErrors((currentErrors: Record<string, string>): Record<string, string> => withoutKey(currentErrors, ingredient.id));
    clearSaveTimer(ingredient.id, saveTimers.current);
    saveTimers.current.set(
      ingredient.id,
      setTimeout((): void => commitIngredient(ingredient, field, nextDraft), AUTOSAVE_DELAY_MS),
    );
  };

  const handleEditableKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const handleServingsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextInput: string = event.target.value;
    setServingsInput(nextInput);
    const nextServings: number = Number(nextInput);
    if (isValidServings(nextServings)) {
      setScaleFactor(nextServings / recipe.servings);
      setActiveAmount(null);
    }
  };

  const changeServings = (amount: number): void => {
    const currentServings: number = isValidServings(Number(servingsInput)) ? Number(servingsInput) : desiredServings;
    const nextServings: number = roundInputNumber(
      Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, currentServings + amount)),
    );
    setServingsInput(formatInputNumber(nextServings));
    setScaleFactor(nextServings / recipe.servings);
    setActiveAmount(null);
  };

  const handleAmountFocus = (ingredient: IRecipeIngredient, scaledQuantity: number): void => {
    setActiveAmount({ ingredientId: ingredient.id, value: formatInputNumber(scaledQuantity) });
  };

  const handleAmountChange = (ingredient: IRecipeIngredient, event: ChangeEvent<HTMLInputElement>): void => {
    const nextValue: string = event.target.value;
    setActiveAmount({ ingredientId: ingredient.id, value: nextValue });
    const nextAmount: number = Number(nextValue);
    if (ingredient.quantity !== null && isPositiveFinite(nextAmount)) {
      const nextFactor: number = nextAmount / ingredient.quantity;
      setScaleFactor(nextFactor);
      setServingsInput(formatInputNumber(recipe.servings * nextFactor));
    }
  };

  const handleAmountBlur = (ingredient: IRecipeIngredient, event: FocusEvent<HTMLInputElement>): void => {
    if (!isPositiveFinite(Number(event.currentTarget.value)) && ingredient.quantity !== null) {
      setActiveAmount({
        ingredientId: ingredient.id,
        value: formatInputNumber(ingredient.quantity * scaleFactor),
      });
    }
  };

  const resetScaling = (): void => {
    setScaleFactor(1);
    setServingsInput(formatInputNumber(recipe.servings));
    setActiveAmount(null);
  };

  const selectOption = (group: IIngredientGroup, ingredient: IRecipeIngredient): void => {
    setActiveOptions((currentOptions: Record<string, string>): Record<string, string> => ({
      ...currentOptions,
      [group.source.id]: ingredient.id,
    }));
  };

  const addVariation = (source: IRecipeIngredient): void => {
    const variationDraft: IIngredientFormValues = variationToFormValues(source);
    const parsed = parseIngredientFormValues(variationDraft);
    if (parsed.input === null) {
      return;
    }
    setSavedIndicator(null);
    variationMutation.mutate({
      sourceId: source.id,
      input: { ...parsed.input, variationOfId: source.id },
    });
  };

  return (
    <Card>
      <CardHeader className="gap-1.5 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          <Scale size={15} />
          Ingredients
        </div>
        <CardTitle>Make it fit the table</CardTitle>
        <CardDescription>Edit servings or any ingredient amount and the rest stay in sync.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div aria-label="Serving scaler" className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-xl bg-[var(--muted)] px-2 py-1" role="group">
          <span className="pl-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Servings</span>
          <div className="flex min-w-24 justify-end">
            {scaleFactor !== 1 ? (
              <Button aria-label={`Reset servings to ${recipe.servings}`} className="shrink-0" onClick={resetScaling} size="sm" variant="ghost">
                <RotateCcw size={14} />
                Reset to {recipe.servings}
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-[2.5rem_3.5rem_2.5rem] items-center">
            <Button aria-label="Decrease servings" disabled={desiredServings <= MIN_SERVINGS} onClick={(): void => changeServings(-1)} size="icon" variant="ghost">
              <Minus size={16} />
            </Button>
            <Input aria-label="Servings" className="h-9 w-14 border-0 bg-transparent px-0 text-center text-xl font-bold shadow-none outline-none focus-visible:border-0 focus-visible:ring-0" max={MAX_SERVINGS} min={MIN_SERVINGS} onChange={handleServingsChange} step="any" type="number" value={servingsInput} />
            <Button aria-label="Increase servings" disabled={desiredServings >= MAX_SERVINGS} onClick={(): void => changeServings(1)} size="icon" variant="ghost">
              <Plus size={16} />
            </Button>
          </div>
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
          {groups.map((group: IIngredientGroup): ReactElement => {
            const activeId: string = activeOptions[group.source.id] ?? group.source.id;
            const ingredient: IRecipeIngredient = group.options.find((option: IRecipeIngredient): boolean => option.id === activeId) ?? group.source;
            const draft: IIngredientFormValues = drafts[ingredient.id] ?? ingredientToFormValues(ingredient);
            const scaledQuantity: number | null = scaleQuantityByFactor(ingredient.quantity, scaleFactor);
            const amountValue: string = activeAmount?.ingredientId === ingredient.id
              ? activeAmount.value
              : scaledQuantity === null ? '' : formatInputNumber(scaledQuantity);
            const isActiveAnchor: boolean = activeAmount?.ingredientId === ingredient.id;
            const variantCount: number = group.options.length - 1;
            const savedField: TEditableIngredientField | null = savedIndicator?.ingredientId === ingredient.id
              ? savedIndicator.field
              : null;

            return (
              <div className={`relative grid grid-cols-[2rem_minmax(0,1fr)_minmax(8.5rem,0.58fr)] gap-x-1.5 px-2.5 py-2 transition-colors sm:px-3 ${isActiveAnchor ? 'bg-[var(--primary-soft)]' : ''}`} key={group.source.id}>
                <div className="relative">
                  {variantCount > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-label={`Edit variants for ${group.source.name}`} className="relative h-8 w-8 overflow-visible rounded-lg" disabled={variationMutation.isPending} size="icon" variant="ghost">
                          <GitFork size={15} />
                          <span aria-label={`${variantCount} ${variantCount === 1 ? 'variant' : 'variants'} for ${group.source.name}`} className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold leading-none text-white">
                            {variantCount}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Choose variant</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={ingredient.id}>
                          {group.options.map((option: IRecipeIngredient): ReactElement => (
                            <DropdownMenuRadioItem key={option.id} onSelect={(): void => selectOption(group, option)} value={option.id}>
                              {drafts[option.id]?.name ?? option.name}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="font-medium text-[var(--primary)]" onSelect={(): void => addVariation(group.source)}>
                          <Plus size={14} />
                          Add variant
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button aria-label={`Add variant for ${group.source.name}`} className="h-8 w-8 rounded-lg" disabled={variationMutation.isPending} onClick={(): void => addVariation(group.source)} size="icon" variant="ghost">
                      <Plus size={15} />
                    </Button>
                  )}
                </div>

                <div className="relative min-w-0">
                  <input
                    aria-label={`Name for ${ingredient.name}`}
                    className="h-8 w-full min-w-0 bg-transparent px-1.5 pr-14 text-sm font-medium outline-none"
                    onBlur={(): void => commitIngredient(ingredient, 'name')}
                    onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient, 'name', event.target.value)}
                    onKeyDown={handleEditableKeyDown}
                    ref={(element: HTMLInputElement | null): void => {
                      if (element === null) nameInputs.current.delete(ingredient.id);
                      else nameInputs.current.set(ingredient.id, element);
                    }}
                    value={draft.name}
                  />
                  {savedField === 'name' ? <SavedTag ingredientName={draft.name.trim() || ingredient.name} /> : null}
                </div>

                <div className="flex min-w-0 items-center justify-end gap-1">
                  <input
                    aria-label={`Amount for ${ingredient.name}`}
                    className="h-8 min-w-0 flex-1 bg-transparent px-1 text-right text-xl font-bold leading-none outline-none"
                    disabled={!isScalable(ingredient)}
                    min="0"
                    onBlur={(event: FocusEvent<HTMLInputElement>): void => handleAmountBlur(ingredient, event)}
                    onChange={(event: ChangeEvent<HTMLInputElement>): void => handleAmountChange(ingredient, event)}
                    onFocus={(): void => {
                      if (scaledQuantity !== null) handleAmountFocus(ingredient, scaledQuantity);
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>): void => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    step="any"
                    type="number"
                    value={amountValue}
                  />
                  <div className="relative w-14">
                    <input
                      aria-label={`Unit for ${ingredient.name}`}
                      className="h-8 w-full bg-transparent px-1 text-xs text-[var(--muted-foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
                      onBlur={(): void => commitIngredient(ingredient, 'unit')}
                      onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient, 'unit', event.target.value)}
                      onKeyDown={handleEditableKeyDown}
                      placeholder="unit"
                      value={draft.unit}
                    />
                    {savedField === 'unit' ? <SavedTag ingredientName={draft.name.trim() || ingredient.name} placement="below" /> : null}
                  </div>
                </div>

                <div className="relative col-span-2 col-start-2 min-w-0">
                  <Input
                    aria-label={`Notes for ${ingredient.name}`}
                    className="h-7 w-full border-0 bg-transparent px-1.5 pr-14 py-0 text-xs text-[var(--muted-foreground)] shadow-none outline-none focus-visible:border-0 focus-visible:ring-0"
                    onBlur={(): void => commitIngredient(ingredient, 'note')}
                    onChange={(event: ChangeEvent<HTMLInputElement>): void => updateDraft(ingredient, 'note', event.target.value)}
                    onKeyDown={handleEditableKeyDown}
                    placeholder="Add a note"
                    value={draft.note}
                  />
                  {savedField === 'note' ? <SavedTag ingredientName={draft.name.trim() || ingredient.name} /> : null}
                </div>
                {(ingredient.measurements ?? []).some((measurement): boolean => !measurement.isPrimary) ? (
                  <p className="col-span-2 col-start-2 px-1.5 text-xs text-[var(--muted-foreground)]">
                    Also {(ingredient.measurements ?? [])
                      .filter((measurement): boolean => !measurement.isPrimary)
                      .map((measurement): string => formatMeasurement(measurement, scaleFactor))
                      .join(' / ')}
                  </p>
                ) : null}
                {formErrors[ingredient.id] !== undefined ? (
                  <p className="col-span-2 col-start-2 mt-1 text-sm text-[var(--destructive)]">{formErrors[ingredient.id]}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        {mutationError !== null ? <p aria-live="polite" className="mt-2 text-xs text-[var(--destructive)]">{mutationError.message}</p> : null}
      </CardContent>
    </Card>
  );
}

function SavedTag({ ingredientName, placement = 'inline' }: { ingredientName: string; placement?: 'inline' | 'below' }): ReactElement {
  return (
    <span
      aria-label={`${ingredientName} saved`}
      className={`saved-indicator pointer-events-none absolute right-1 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-[var(--success)] ${placement === 'below' ? 'top-full z-10' : 'top-1/2 -translate-y-1/2'}`}
      role="status"
    >
      <Check size={12} />
      Saved
    </span>
  );
}

function groupIngredients(ingredients: readonly IRecipeIngredient[]): IIngredientGroup[] {
  const sourceIngredients: IRecipeIngredient[] = ingredients.filter(
    (ingredient: IRecipeIngredient): boolean => ingredient.variationOfId === undefined || ingredient.variationOfId === null,
  );
  const knownSourceIds: Set<string> = new Set(sourceIngredients.map((ingredient: IRecipeIngredient): string => ingredient.id));
  const orphanedVariations: IRecipeIngredient[] = ingredients.filter(
    (ingredient: IRecipeIngredient): boolean => ingredient.variationOfId !== undefined && ingredient.variationOfId !== null && !knownSourceIds.has(ingredient.variationOfId),
  );
  return [...sourceIngredients, ...orphanedVariations].map((source: IRecipeIngredient): IIngredientGroup => ({
    source,
    options: [
      source,
      ...ingredients.filter((ingredient: IRecipeIngredient): boolean => ingredient.variationOfId === source.id),
    ],
  }));
}

function createDrafts(ingredients: readonly IRecipeIngredient[]): Record<string, IIngredientFormValues> {
  const drafts: Record<string, IIngredientFormValues> = {};
  for (const ingredient of ingredients) drafts[ingredient.id] = ingredientToFormValues(ingredient);
  return drafts;
}

function mergeDrafts(
  ingredients: readonly IRecipeIngredient[],
  currentDrafts: Record<string, IIngredientFormValues>,
): Record<string, IIngredientFormValues> {
  const drafts: Record<string, IIngredientFormValues> = {};
  for (const ingredient of ingredients) {
    drafts[ingredient.id] = currentDrafts[ingredient.id] ?? ingredientToFormValues(ingredient);
  }
  return drafts;
}

function createActiveOptions(groups: readonly IIngredientGroup[]): Record<string, string> {
  const activeOptions: Record<string, string> = {};
  for (const group of groups) activeOptions[group.source.id] = group.source.id;
  return activeOptions;
}

function clearSaveTimer(ingredientId: string, timers: Map<string, ReturnType<typeof setTimeout>>): void {
  const timer: ReturnType<typeof setTimeout> | undefined = timers.get(ingredientId);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(ingredientId);
}

function withoutKey(values: Record<string, string>, key: string): Record<string, string> {
  const nextValues: Record<string, string> = { ...values };
  delete nextValues[key];
  return nextValues;
}

function ingredientMatchesInput(ingredient: IRecipeIngredient, input: IIngredientEditInput): boolean {
  return ingredient.name === input.name
    && ingredient.quantity === input.quantity
    && ingredient.unit === input.unit
    && ingredient.note === input.note;
}

function isScalable(ingredient: IRecipeIngredient): boolean {
  return ingredient.quantity !== null && ingredient.quantity > 0;
}

function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return roundInputNumber(value).toString();
}

function roundInputNumber(value: number): number {
  return Number(value.toFixed(6));
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidServings(value: number): boolean {
  return isPositiveFinite(value) && value >= MIN_SERVINGS && value <= MAX_SERVINGS;
}
