export type TerminalStatus = "completed" | "needs_input" | "failed";

export type ActiveStatus =
  | "pending"
  | "fetching"
  | "extracting"
  | "normalizing"
  | "persisting";

export type JobStatus = ActiveStatus | TerminalStatus;

export type ImportStage =
  | "submit"
  | "fetch"
  | "extract"
  | "normalize"
  | "validate"
  | "persist";

export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "WORKER_UNAUTHORIZED"
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "URL_CREDENTIALS_NOT_ALLOWED"
  | "URL_PORT_NOT_ALLOWED"
  | "SSRF_BLOCKED"
  | "DNS_RESOLUTION_FAILED"
  | "REDIRECT_LIMIT_EXCEEDED"
  | "REDIRECT_LOCATION_INVALID"
  | "REDIRECT_LOOP"
  | "FETCH_TIMEOUT"
  | "FETCH_NETWORK_ERROR"
  | "HTTP_STATUS_ERROR"
  | "CONTENT_TYPE_UNSUPPORTED"
  | "RESPONSE_TOO_LARGE"
  | "RECIPE_NOT_FOUND"
  | "RECIPE_OUTPUT_INVALID"
  | "AI_NORMALIZER_NOT_CONFIGURED"
  | "AI_NORMALIZATION_FAILED"
  | "PERSISTENCE_NOT_CONFIGURED"
  | "PERSISTENCE_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "STATE_TRANSITION_INVALID"
  | "INTERNAL_ERROR";

export type ErrorDetail = string | number | boolean | null;

export type ErrorDetails = Readonly<Record<string, ErrorDetail>>;

export interface StructuredError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly stage: ImportStage;
  readonly attempt: number;
  readonly retryable: boolean;
  readonly details: ErrorDetails;
}

export interface ImportRequest {
  readonly source_url: string;
  readonly idempotency_key: string;
  readonly user_id?: string | null;
}

export interface RecipeIngredient {
  readonly id?: string;
  readonly original: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly name: string;
  readonly notes: string | null;
  readonly measurements?: readonly IngredientMeasurement[];
  readonly sort_order?: number;
}

export interface IngredientMeasurement {
  readonly quantity_min: number;
  readonly quantity_max: number;
  readonly unit: string | null;
  readonly is_primary: boolean;
}

export interface NormalizedRecipeStep {
  readonly id?: string;
  readonly instruction: string;
  readonly timer_duration_minutes: number | null;
  readonly sort_order?: number;
}

export interface RecipeFlowNode {
  readonly id: string;
  readonly stepId: string;
  readonly ingredientIds: readonly string[];
}

export interface RecipeFlowEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: "sequence" | "dependency";
}

export interface RecipeFlow {
  readonly derivation: "enriched" | "linear_fallback";
  readonly nodes: readonly RecipeFlowNode[];
  readonly edges: readonly RecipeFlowEdge[];
}

export interface IngredientLinkingIngredient {
  readonly id: string;
  readonly originalText: string;
  readonly name: string;
}

export interface IngredientLinkingStep {
  readonly id: string;
  readonly instruction: string;
}

export interface IngredientLinkingInput {
  readonly ingredients: readonly IngredientLinkingIngredient[];
  readonly steps: readonly IngredientLinkingStep[];
  readonly deterministic_flow?: RecipeFlow;
}

export interface IngredientLinkingAdapter {
  link(input: IngredientLinkingInput): Promise<RecipeFlow | null>;
}

export interface NormalizedRecipe {
  readonly title: string;
  readonly description: string | null;
  readonly ingredients: readonly RecipeIngredient[];
  readonly steps: readonly string[];
  readonly servings: number | null;
  readonly prep_time_minutes: number | null;
  readonly cook_time_minutes: number | null;
  readonly image_url: string | null;
  readonly source_url: string | null;
  readonly images?: readonly string[];
  readonly cuisine_type?: string | null;
  readonly dietary_tags?: readonly string[];
  readonly total_time_minutes?: number | null;
  readonly parse_confidence?: number | null;
  readonly status?: "draft" | "ready" | "needs_review";
  readonly step_details?: readonly NormalizedRecipeStep[];
  readonly flow?: RecipeFlow;
}

export interface NormalizedRecipeDraft {
  readonly title: string;
  readonly description: string | null;
  readonly ingredients: readonly RecipeIngredient[];
  readonly steps: readonly (string | NormalizedRecipeStep)[];
  readonly servings: number | null;
  readonly prep_time_minutes: number | null;
  readonly cook_time_minutes: number | null;
  readonly image_url: string | null;
  readonly source_url?: string | null;
  readonly images?: readonly string[];
  readonly cuisine_type?: string | null;
  readonly dietary_tags?: readonly string[];
  readonly total_time_minutes?: number | null;
  readonly parse_confidence?: number | null;
  readonly status?: "draft" | "ready" | "needs_review";
  readonly step_details?: readonly NormalizedRecipeStep[];
  readonly flow?: RecipeFlow;
}

export interface SourceDocument {
  readonly source_url: string;
  readonly final_url: string;
  readonly status: number;
  readonly content_type: string | null;
  readonly body: string;
  readonly redirect_count: number;
}

export interface SourceFetcher {
  fetch(source_url: string, attempt: number): Promise<SourceDocument>;
}

export interface AiNormalizationInput {
  readonly source_url: string | null;
  readonly resolved_url: string | null;
  readonly content: string;
  readonly attempt: number;
}

export interface AiNormalizationAdapter {
  normalize(input: AiNormalizationInput): Promise<NormalizedRecipeDraft>;
}

export interface IngredientNormalizationInput {
  readonly ingredients: readonly string[];
}

export interface IngredientNormalizationAdapter {
  normalizeIngredients(
    input: IngredientNormalizationInput,
  ): Promise<readonly RecipeIngredient[]>;
}

export interface ImportJobState {
  readonly id: string;
  readonly idempotency_key: string;
  readonly source_url: string;
  readonly user_id: string | null;
  readonly status: JobStatus;
  readonly attempt: number;
  readonly last_error: StructuredError | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ImportLogEvent {
  readonly event: string;
  readonly job_id: string;
  readonly idempotency_key: string;
  readonly stage: ImportStage;
  readonly attempt: number;
  readonly status: JobStatus;
  readonly error_code: ErrorCode | null;
  readonly retryable: boolean;
  readonly details: ErrorDetails;
}

export interface ImportLogger {
  log(event: ImportLogEvent): void;
}
