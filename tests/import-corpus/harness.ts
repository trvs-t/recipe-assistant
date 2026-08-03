import type {
  CorpusCase,
  IPageCorpusCase,
  IRedirectCorpusCase,
  IUrlPolicyInput,
  PageClassification,
  TerminalState,
  UrlPolicyRejectionReason,
} from "./manifest.ts";
import {
  extractRecipeFromJsonLd,
} from "../../supabase/functions/import-recipe-v2/json-ld-extractor.ts";
import type {
  NormalizedRecipe,
  RecipeIngredient,
} from "../../supabase/functions/import-recipe-v2/types.ts";
import {
  DEFAULT_URL_POLICY,
  type HostResolver,
  validateSourceUrl,
} from "../../supabase/functions/import-recipe-v2/url-policy.ts";

export interface IExtractedRecipe {
  title: string;
  ingredients: readonly string[];
  steps: readonly string[];
  servings?: number;
  sourceUrl: string;
}

export interface IPageEvaluation {
  classification: PageClassification;
  terminalState: TerminalState;
  sourceUrl: string;
  jsonLdBlockCount: number;
  malformedJsonLdBlockCount: number;
  recipe?: IExtractedRecipe;
  fallbackText: string;
  fallbackReason?:
    | "malformed_structured_data"
    | "no_structured_data"
    | "not_recipe_content";
}

export interface IUrlPolicyResult {
  allowed: boolean;
  reason?: UrlPolicyRejectionReason;
}

export interface IImportV2Request {
  userId: string;
  sourceUrl: string;
  idempotencyKey: string;
}

export type ImportClassification =
  | PageClassification
  | "redirect_rejected"
  | "url_rejected";

export interface IImportV2Result {
  recordId: string;
  classification: ImportClassification;
  terminalState: TerminalState;
  sourceUrl: string;
  duplicate: boolean;
  aiCalled: boolean;
  jsonLdBlockCount: number;
  malformedJsonLdBlockCount: number;
  redirectCount: number;
  recipe?: IExtractedRecipe;
  fallbackText?: string;
  errorCode?: string;
}

export interface IAdapterMetrics {
  fetchCount: number;
  fetchesByUrl: Readonly<Record<string, number>>;
  aiCallCount: number;
}

/**
 * The seam that the import-v2 implementation should satisfy.
 *
 * The reference adapter below is deliberately offline and persistence-independent;
 * it delegates deterministic extraction and URL policy checks to import-v2 modules.
 */
export interface IImportV2Adapter {
  submit(request: IImportV2Request): Promise<IImportV2Result>;
  metrics(): IAdapterMetrics;
  recordCount(): number;
}

export interface IOfflineRoute {
  url: string;
  status: number;
  contentType?: string;
  body?: string;
  location?: string;
}

const OFFLINE_PUBLIC_IP: string = "93.184.216.34";
const offlineResolver: HostResolver = {
  async resolve(_hostname: string): Promise<readonly string[]> {
    return [OFFLINE_PUBLIC_IP];
  },
};

interface IJsonLdBlockResult {
  value: unknown | null;
  parseError?: string;
}

export function extractJsonLdBlocks(html: string): readonly string[] {
  const scriptPattern =
    /<script\b[^>]*\btype\s*=\s*(['"])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null = scriptPattern.exec(html);

  while (match !== null) {
    blocks.push(match[2]);
    match = scriptPattern.exec(html);
  }

  return blocks;
}

function parseJsonLd(rawBlock: string): IJsonLdBlockResult {
  try {
    return { value: JSON.parse(rawBlock) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, parseError: message };
  }
}

function extractPlainText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRecipeTextSignals(text: string): boolean {
  const hasIngredients: boolean = /\bingredients?\b/i.test(text);
  const hasInstructions: boolean = /\b(instructions?|directions?|method)\b/i
    .test(text);
  return hasIngredients && hasInstructions;
}

export function evaluatePage(html: string, sourceUrl: string): IPageEvaluation {
  const blocks: readonly string[] = extractJsonLdBlocks(html);
  let malformedJsonLdBlockCount: number = 0;

  for (const block of blocks) {
    const parsed: IJsonLdBlockResult = parseJsonLd(block);
    if (parsed.parseError !== undefined) {
      malformedJsonLdBlockCount += 1;
    }
  }

  const deterministicRecipe: NormalizedRecipe | null = extractRecipeFromJsonLd(
    html,
    sourceUrl,
  );
  if (deterministicRecipe !== null) {
    const recipe: IExtractedRecipe = toExtractedRecipe(deterministicRecipe);
    return {
      classification: "structured_recipe",
      terminalState: "parsed",
      sourceUrl,
      jsonLdBlockCount: blocks.length,
      malformedJsonLdBlockCount,
      recipe,
      fallbackText: extractPlainText(html),
    };
  }

  const fallbackText: string = extractPlainText(html);
  const hasRecipeSignals: boolean = hasRecipeTextSignals(fallbackText);
  if (hasRecipeSignals) {
    return {
      classification: "ai_fallback",
      terminalState: "draft",
      sourceUrl,
      jsonLdBlockCount: blocks.length,
      malformedJsonLdBlockCount,
      fallbackText,
      fallbackReason: malformedJsonLdBlockCount > 0
        ? "malformed_structured_data"
        : "no_structured_data",
    };
  }

  return {
    classification: "unsupported",
    terminalState: "error",
    sourceUrl,
    jsonLdBlockCount: blocks.length,
    malformedJsonLdBlockCount,
    fallbackText,
    fallbackReason: "not_recipe_content",
  };
}

function toExtractedRecipe(recipe: NormalizedRecipe): IExtractedRecipe {
  const servings: number | undefined = recipe.servings === null
    ? undefined
    : recipe.servings;
  return {
    title: recipe.title,
    ingredients: recipe.ingredients.map(
      (ingredient: RecipeIngredient): string => ingredient.original,
    ),
    steps: recipe.steps,
    ...(servings === undefined ? {} : { servings }),
    sourceUrl: recipe.source_url,
  };
}

function normalizedHostname(sourceUrl: URL): string {
  return sourceUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(
    /\.$/,
    "",
  );
}

function parseIpv4(hostname: string): readonly number[] | null {
  const parts: string[] = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part: string): boolean => !/^\d+$/.test(part))
  ) {
    return null;
  }

  const octets: number[] = parts.map((part: string): number => Number(part));
  if (octets.some((octet: number): boolean => octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
}

function classifyIpv4(hostname: string): UrlPolicyRejectionReason | undefined {
  const octets: readonly number[] | null = parseIpv4(hostname);
  if (octets === null) {
    return undefined;
  }

  const first: number = octets[0];
  const second: number = octets[1];

  if (first === 127) {
    return "loopback_ip";
  }

  if (first === 169 && second === 254) {
    return "link_local_ip";
  }

  if (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  ) {
    return "private_ip";
  }

  if (first >= 224) {
    return "multicast_ip";
  }

  return undefined;
}

function classifyIpv6(hostname: string): UrlPolicyRejectionReason | undefined {
  const normalized: string = hostname.toLowerCase();
  if (!normalized.includes(":")) {
    return undefined;
  }

  const mappedIpv4: RegExpMatchArray | null = normalized.match(
    /^::ffff:(\d+\.\d+\.\d+\.\d+)$/,
  );
  if (mappedIpv4 !== null) {
    return classifyIpv4(mappedIpv4[1]);
  }

  if (normalized === "::" || normalized === "::1") {
    return "loopback_ip";
  }

  if (normalized.startsWith("fe80:")) {
    return "link_local_ip";
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return "private_ip";
  }

  if (normalized.startsWith("ff")) {
    return "multicast_ip";
  }

  return undefined;
}

export function evaluateUrlPolicy(sourceUrl: string): IUrlPolicyResult {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch (error) {
    const message: string = error instanceof Error
      ? error.message
      : String(error);
    if (message.length === 0) {
      return { allowed: false, reason: "invalid_url" };
    }
    return { allowed: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "unsupported_scheme" };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return { allowed: false, reason: "userinfo_not_allowed" };
  }

  const hostname: string = normalizedHostname(parsed);
  const localHostname: boolean = hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");
  if (localHostname) {
    return { allowed: false, reason: "local_hostname" };
  }

  const addressReason: UrlPolicyRejectionReason | undefined =
    classifyIpv4(hostname) ?? classifyIpv6(hostname);
  if (addressReason !== undefined) {
    return { allowed: false, reason: addressReason };
  }

  return { allowed: true };
}

export async function productionUrlAllowed(
  sourceUrl: string,
): Promise<boolean> {
  try {
    await validateSourceUrl(sourceUrl, DEFAULT_URL_POLICY, offlineResolver);
    return true;
  } catch (error) {
    return false;
  }
}

function stableRecordId(idempotencyScope: string): string {
  let hash: number = 2166136261;
  for (const character of idempotencyScope) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return `offline-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export class OfflineReferenceAdapter implements IImportV2Adapter {
  private readonly routes: ReadonlyMap<string, IOfflineRoute>;
  private readonly records: Map<string, IImportV2Result> = new Map<
    string,
    IImportV2Result
  >();
  private readonly fetchesByUrl: Map<string, number> = new Map<
    string,
    number
  >();
  private aiCallCount: number = 0;

  public constructor(routes: readonly IOfflineRoute[]) {
    this.routes = new Map<string, IOfflineRoute>(
      routes.map((
        route: IOfflineRoute,
      ): [string, IOfflineRoute] => [route.url, route]),
    );
  }

  public async submit(request: IImportV2Request): Promise<IImportV2Result> {
    const idempotencyScope: string =
      `${request.userId}\u0000${request.idempotencyKey}`;
    const existing: IImportV2Result | undefined = this.records.get(
      idempotencyScope,
    );
    if (existing !== undefined) {
      return { ...existing, duplicate: true };
    }

    const recordId: string = stableRecordId(idempotencyScope);
    const policy: IUrlPolicyResult = evaluateUrlPolicy(request.sourceUrl);
    const productionPolicyAllowed: boolean = await productionUrlAllowed(
      request.sourceUrl,
    );
    let result: IImportV2Result;

    if (!policy.allowed || !productionPolicyAllowed) {
      result = {
        recordId,
        classification: "url_rejected",
        terminalState: "error",
        sourceUrl: request.sourceUrl,
        duplicate: false,
        aiCalled: false,
        jsonLdBlockCount: 0,
        malformedJsonLdBlockCount: 0,
        redirectCount: 0,
        errorCode: policy.reason ?? "production_policy_rejected",
      };
    } else {
      let currentUrl: string = request.sourceUrl;
      let redirectCount: number = 0;
      const visitedUrls: Set<string> = new Set<string>([currentUrl]);

      while (true) {
        const route: IOfflineRoute | undefined = this.routes.get(currentUrl);
        this.recordFetch(currentUrl);

        if (route === undefined) {
          result = this.errorResult(
            recordId,
            request.sourceUrl,
            "missing_fixture_route",
            redirectCount,
          );
          break;
        }

        if (route.status >= 300 && route.status < 400) {
          if (redirectCount >= DEFAULT_URL_POLICY.max_redirects) {
            result = this.errorResult(
              recordId,
              request.sourceUrl,
              "redirect_limit_exceeded",
              redirectCount,
            );
            break;
          }

          if (route.location === undefined) {
            result = this.errorResult(
              recordId,
              request.sourceUrl,
              "redirect_location_missing",
              redirectCount,
            );
            break;
          }

          let nextUrl: string;
          try {
            nextUrl = new URL(route.location, currentUrl).toString();
          } catch (error) {
            const message: string = error instanceof Error
              ? error.message
              : String(error);
            result = this.errorResult(
              recordId,
              request.sourceUrl,
              `redirect_location_invalid:${message}`,
              redirectCount,
            );
            break;
          }

          if (visitedUrls.has(nextUrl)) {
            result = this.errorResult(
              recordId,
              request.sourceUrl,
              "redirect_loop",
              redirectCount,
            );
            break;
          }

          const nextPolicy: IUrlPolicyResult = evaluateUrlPolicy(nextUrl);
          const nextProductionPolicyAllowed: boolean =
            await productionUrlAllowed(nextUrl);
          if (!nextPolicy.allowed || !nextProductionPolicyAllowed) {
            result = this.errorResult(
              recordId,
              request.sourceUrl,
              "redirect_target_policy_rejected",
              redirectCount,
            );
            break;
          }

          visitedUrls.add(nextUrl);
          currentUrl = nextUrl;
          redirectCount += 1;
          continue;
        }

        if (route.status < 200 || route.status >= 300) {
          result = this.errorResult(
            recordId,
            request.sourceUrl,
            `http_${route.status}`,
            redirectCount,
          );
          break;
        }

        if (
          route.contentType !== undefined &&
          !route.contentType.toLowerCase().includes("text/html")
        ) {
          result = this.errorResult(
            recordId,
            request.sourceUrl,
            "non_html_content",
            redirectCount,
          );
          break;
        }

        if (route.body === undefined) {
          result = this.errorResult(
            recordId,
            request.sourceUrl,
            "empty_fixture_body",
            redirectCount,
          );
          break;
        }

        const evaluation: IPageEvaluation = evaluatePage(
          route.body,
          request.sourceUrl,
        );
        result = {
          recordId,
          classification: evaluation.classification,
          terminalState: evaluation.terminalState,
          sourceUrl: evaluation.sourceUrl,
          duplicate: false,
          aiCalled: false,
          jsonLdBlockCount: evaluation.jsonLdBlockCount,
          malformedJsonLdBlockCount: evaluation.malformedJsonLdBlockCount,
          redirectCount,
          recipe: evaluation.recipe,
          fallbackText: evaluation.fallbackText,
          errorCode: evaluation.classification === "unsupported"
            ? "unsupported_page"
            : undefined,
        };
        break;
      }
    }

    this.records.set(idempotencyScope, result);
    return result;
  }

  public metrics(): IAdapterMetrics {
    const fetchesByUrl: Record<string, number> = {};
    for (const [url] of this.routes.entries()) {
      fetchesByUrl[url] = this.fetchesByUrl.get(url) ?? 0;
    }
    for (const [url, count] of this.fetchesByUrl.entries()) {
      fetchesByUrl[url] = count;
    }

    return {
      fetchCount: Object.values(fetchesByUrl).reduce(
        (total: number, count: number): number => total + count,
        0,
      ),
      fetchesByUrl,
      aiCallCount: this.aiCallCount,
    };
  }

  public recordCount(): number {
    return this.records.size;
  }

  private recordFetch(url: string): void {
    const currentCount: number = this.fetchesByUrl.get(url) ?? 0;
    this.fetchesByUrl.set(url, currentCount + 1);
  }

  private errorResult(
    recordId: string,
    sourceUrl: string,
    errorCode: string,
    redirectCount: number,
  ): IImportV2Result {
    return {
      recordId,
      classification: "url_rejected",
      terminalState: "error",
      sourceUrl,
      duplicate: false,
      aiCalled: false,
      jsonLdBlockCount: 0,
      malformedJsonLdBlockCount: 0,
      redirectCount,
      errorCode,
    };
  }
}

export async function readFixture(fixturePath: string): Promise<string> {
  return await Deno.readTextFile(new URL(fixturePath, import.meta.url));
}

export function pageRoutes(
  corpusCase: IPageCorpusCase,
  fixtureBody: string,
): readonly IOfflineRoute[] {
  return [
    {
      url: corpusCase.sourceUrl,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureBody,
    },
  ];
}

export function redirectRoutes(
  corpusCase: IRedirectCorpusCase,
  targetBody: string,
): readonly IOfflineRoute[] {
  return [
    {
      url: corpusCase.sourceUrl,
      status: 302,
      contentType: "text/html; charset=utf-8",
      location: corpusCase.redirectTargetUrl,
    },
    {
      url: corpusCase.redirectTargetUrl,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: targetBody,
    },
  ];
}

export function urlPolicyInputs(
  corpusCase: CorpusCase,
): readonly IUrlPolicyInput[] {
  return corpusCase.kind === "url_policy" ? corpusCase.inputs : [];
}
