import { z } from "zod";

const nullableTrimmedTextSchema = z.string().trim().min(1).nullable();

export const sourceUrlSchema = z
  .url()
  .refine((value: string): boolean => {
    const protocol: string = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Source URL must use http or https");

export const recipeStatusSchema = z.enum([
  "draft",
  "ready",
  "needs_review",
]);

export const ingredientSchema = z.object({
  id: z.string().min(1),
  originalText: z.string().trim().min(1),
  quantity: z.number().positive().nullable(),
  unit: nullableTrimmedTextSchema,
  name: z.string().trim().min(1),
  notes: nullableTrimmedTextSchema,
  measurements: z.array(z.object({
    quantityMin: z.number().positive(),
    quantityMax: z.number().positive(),
    unit: nullableTrimmedTextSchema,
    isPrimary: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
  }).refine(
    (measurement): boolean => measurement.quantityMax >= measurement.quantityMin,
    "Measurement ranges must be ordered",
  )).refine(
    (measurements): boolean =>
      measurements.length === 0 ||
      measurements.filter((measurement): boolean => measurement.isPrimary).length === 1,
    "Ingredient measurements must have exactly one primary measurement",
  ).default([]),
  sortOrder: z.number().int().nonnegative(),
});

export const recipeStepSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().trim().min(1),
  timerDurationMinutes: z.number().int().positive().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  stepId: z.string().min(1),
  ingredientIds: z.array(z.string().min(1)),
});

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  kind: z.enum(["sequence", "dependency"]),
});

export const recipeFlowSchema = z.object({
  derivation: z.enum(["enriched", "linear_fallback"]),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
});

export const recipeSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  sourceUrl: sourceUrlSchema.nullable(),
  description: nullableTrimmedTextSchema,
  prepTimeMinutes: z.number().int().nonnegative().nullable(),
  cookTimeMinutes: z.number().int().nonnegative().nullable(),
  totalTimeMinutes: z.number().int().nonnegative().nullable(),
  servings: z.number().int().positive().nullable(),
  images: z.array(z.url()),
  cuisineType: nullableTrimmedTextSchema,
  dietaryTags: z.array(z.string().trim().min(1)),
  status: recipeStatusSchema,
  parseConfidence: z.number().min(0).max(1).nullable(),
  ingredients: z.array(ingredientSchema),
  steps: z.array(recipeStepSchema),
  flow: recipeFlowSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const importedRecipeSchema = recipeSchema.extend({
  sourceUrl: sourceUrlSchema,
});

export const importJobStatusSchema = z.enum([
  "queued",
  "fetching",
  "extracting",
  "normalizing",
  "validating",
  "persisting",
  "retry_wait",
  "completed",
  "needs_input",
  "failed",
]);

export const importErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  retryable: z.boolean(),
  stage: z.enum([
    "submit",
    "fetch",
    "extract",
    "normalize",
    "validate",
    "persist",
  ]),
});

export const importJobSchema = z.object({
  id: z.string().min(1),
  sourceUrl: sourceUrlSchema,
  idempotencyKey: z.string().trim().min(1),
  status: importJobStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  recipeId: z.string().min(1).nullable(),
  error: importErrorSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const submitImportRequestSchema = z.object({
  sourceUrl: sourceUrlSchema,
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export const submitImportResponseSchema = z.object({
  jobId: z.string().min(1),
  status: importJobStatusSchema,
  recipeId: z.string().min(1).nullable(),
  deduplicated: z.boolean(),
});

export type RecipeStatus = z.infer<typeof recipeStatusSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
export type RecipeFlow = z.infer<typeof recipeFlowSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;
export type ImportError = z.infer<typeof importErrorSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type SubmitImportRequest = z.infer<typeof submitImportRequestSchema>;
export type SubmitImportResponse = z.infer<typeof submitImportResponseSchema>;
