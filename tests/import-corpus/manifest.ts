export type CorpusCaseKind = "page" | "redirect" | "url_policy" | "idempotency";

export type PageClassification =
  | "structured_recipe"
  | "ai_fallback"
  | "unsupported";

export type TerminalState = "parsed" | "draft" | "error";

export type UrlPolicyRejectionReason =
  | "invalid_url"
  | "unsupported_scheme"
  | "userinfo_not_allowed"
  | "local_hostname"
  | "loopback_ip"
  | "link_local_ip"
  | "private_ip"
  | "multicast_ip";

export interface IRecipeExpectation {
  title: string;
  ingredients: readonly string[];
  steps: readonly string[];
  servings?: number;
  sourceUrl: string;
}

export interface IPageExpectation {
  classification: PageClassification;
  terminalState: TerminalState;
  sourceUrl: string;
  jsonLdBlockCount: number;
  malformedJsonLdBlockCount: number;
  recipe?: IRecipeExpectation;
  fallbackTextIncludes?: readonly string[];
}

interface ICorpusCaseBase {
  id: string;
  description: string;
  tags: readonly string[];
  expectedAiCalls: 0;
}

export interface IPageCorpusCase extends ICorpusCaseBase {
  kind: "page";
  fixture: string;
  sourceUrl: string;
  expectedFetchCount: 1;
  expected: IPageExpectation;
}

export interface IRedirectExpectation {
  classification: "structured_recipe";
  terminalState: "parsed";
  sourceUrl: string;
  redirectCount: 1;
  recipe: IRecipeExpectation;
}

export interface IRedirectCorpusCase extends ICorpusCaseBase {
  kind: "redirect";
  sourceUrl: string;
  redirectTargetUrl: string;
  redirectTargetFixture: string;
  redirectPolicy: "follow";
  expectedFetchCount: 2;
  expectedFetchesByUrl: Readonly<Record<string, number>>;
  expected: IRedirectExpectation;
}

export interface IUrlPolicyInput {
  url: string;
  expectedReason: UrlPolicyRejectionReason;
}

export interface IUrlPolicyCorpusCase extends ICorpusCaseBase {
  kind: "url_policy";
  inputs: readonly IUrlPolicyInput[];
  expectedFetchCount: 0;
}

export interface IIdempotencyExpectation {
  classification: "structured_recipe";
  terminalState: "parsed";
  sourceUrl: string;
  sameRecord: true;
  recordCount: 1;
  expectedFetchCount: 1;
}

export interface IIdempotencyCorpusCase extends ICorpusCaseBase {
  kind: "idempotency";
  fixture: string;
  sourceUrl: string;
  userId: string;
  idempotencyKey: string;
  submissionCount: 2;
  expected: IIdempotencyExpectation;
}

export type CorpusCase =
  | IPageCorpusCase
  | IRedirectCorpusCase
  | IUrlPolicyCorpusCase
  | IIdempotencyCorpusCase;

export interface ICorpusManifest {
  version: 1;
  name: string;
  redirectPolicy: "follow";
  maxFetchesPerAcceptedSubmission: 4;
  cases: readonly CorpusCase[];
}

export const corpusManifest: ICorpusManifest = {
  version: 1,
  name: "import-v2 offline acceptance corpus",
  redirectPolicy: "follow",
  maxFetchesPerAcceptedSubmission: 4,
  cases: [
    {
      id: "structured-direct-recipe",
      kind: "page",
      description: "Extract a direct schema.org Recipe JSON-LD object.",
      tags: [
        "json-ld",
        "schema-org",
        "deterministic",
        "source-url-preservation",
      ],
      fixture: "fixtures/valid-schema-recipe.html",
      sourceUrl:
        "https://fixtures.test/import-v2/direct-recipe?source=acceptance",
      expectedFetchCount: 1,
      expectedAiCalls: 0,
      expected: {
        classification: "structured_recipe",
        terminalState: "parsed",
        sourceUrl:
          "https://fixtures.test/import-v2/direct-recipe?source=acceptance",
        jsonLdBlockCount: 1,
        malformedJsonLdBlockCount: 0,
        recipe: {
          title: "Citrus Bean Toast",
          ingredients: [
            "2 slices sourdough bread",
            "1 cup white beans",
            "1 tablespoon lemon juice",
          ],
          steps: [
            "Toast the bread until crisp.",
            "Stir the beans with lemon juice and spoon them over the toast.",
          ],
          servings: 2,
          sourceUrl:
            "https://fixtures.test/import-v2/direct-recipe?source=acceptance",
        },
      },
    },
    {
      id: "structured-graph-recipe",
      kind: "page",
      description: "Find a Recipe node nested in a JSON-LD @graph.",
      tags: ["json-ld", "@graph", "deterministic"],
      fixture: "fixtures/graph-recipe.html",
      sourceUrl: "https://fixtures.test/import-v2/graph-recipe",
      expectedFetchCount: 1,
      expectedAiCalls: 0,
      expected: {
        classification: "structured_recipe",
        terminalState: "parsed",
        sourceUrl: "https://fixtures.test/import-v2/graph-recipe",
        jsonLdBlockCount: 1,
        malformedJsonLdBlockCount: 0,
        recipe: {
          title: "Rainy Day Rice",
          ingredients: ["1 cup rice", "2 cups vegetable stock", "1 lime"],
          steps: [
            "Rinse the rice.",
            "Simmer the rice in stock until tender, then finish with lime.",
          ],
          servings: 3,
          sourceUrl: "https://fixtures.test/import-v2/graph-recipe",
        },
      },
    },
    {
      id: "structured-multiple-jsonld-blocks",
      kind: "page",
      description:
        "Ignore non-recipe JSON-LD blocks and select the recipe block.",
      tags: ["json-ld", "multiple-blocks", "deterministic"],
      fixture: "fixtures/multiple-jsonld-blocks.html",
      sourceUrl: "https://fixtures.test/import-v2/multiple-jsonld-blocks",
      expectedFetchCount: 1,
      expectedAiCalls: 0,
      expected: {
        classification: "structured_recipe",
        terminalState: "parsed",
        sourceUrl: "https://fixtures.test/import-v2/multiple-jsonld-blocks",
        jsonLdBlockCount: 3,
        malformedJsonLdBlockCount: 0,
        recipe: {
          title: "Garden Noodle Jar",
          ingredients: [
            "100 g noodles",
            "1 carrot",
            "2 tablespoons sesame dressing",
          ],
          steps: [
            "Cook the noodles and cool them under cold water.",
            "Layer the carrot, noodles, and dressing in a jar.",
          ],
          servings: 1,
          sourceUrl: "https://fixtures.test/import-v2/multiple-jsonld-blocks",
        },
      },
    },
    {
      id: "malformed-jsonld-recoverable-page-text",
      kind: "page",
      description:
        "Classify malformed JSON-LD as AI fallback while retaining visible recipe text.",
      tags: ["malformed-json-ld", "ai-fallback", "no-api"],
      fixture: "fixtures/malformed-jsonld-recoverable.html",
      sourceUrl: "https://fixtures.test/import-v2/malformed-jsonld",
      expectedFetchCount: 1,
      expectedAiCalls: 0,
      expected: {
        classification: "ai_fallback",
        terminalState: "draft",
        sourceUrl: "https://fixtures.test/import-v2/malformed-jsonld",
        jsonLdBlockCount: 1,
        malformedJsonLdBlockCount: 1,
        fallbackTextIncludes: [
          "Smoky Lentil Bowl",
          "Ingredients",
          "Instructions",
        ],
      },
    },
    {
      id: "no-structured-data-ai-fallback",
      kind: "page",
      description:
        "Classify recipe-shaped page text without structured data as AI fallback.",
      tags: ["no-structured-data", "ai-fallback", "no-api"],
      fixture: "fixtures/no-structured-data-ai-fallback.html",
      sourceUrl: "https://fixtures.test/import-v2/plain-recipe-text",
      expectedFetchCount: 1,
      expectedAiCalls: 0,
      expected: {
        classification: "ai_fallback",
        terminalState: "draft",
        sourceUrl: "https://fixtures.test/import-v2/plain-recipe-text",
        jsonLdBlockCount: 0,
        malformedJsonLdBlockCount: 0,
        fallbackTextIncludes: [
          "Ginger Oat Pancakes",
          "Ingredients",
          "Instructions",
        ],
      },
    },
    {
      id: "unsupported-page",
      kind: "page",
      description:
        "Reject a page with no recipe structured data or recipe-shaped text.",
      tags: ["unsupported", "no-api"],
      fixture: "fixtures/unsupported-page.html",
      sourceUrl: "https://fixtures.test/import-v2/library-events",
      expectedFetchCount: 1,
      expectedAiCalls: 0,
      expected: {
        classification: "unsupported",
        terminalState: "error",
        sourceUrl: "https://fixtures.test/import-v2/library-events",
        jsonLdBlockCount: 0,
        malformedJsonLdBlockCount: 0,
      },
    },
    {
      id: "redirect-policy-follows-with-bound",
      kind: "redirect",
      description:
        "Follow one bounded redirect and preserve the original source URL.",
      tags: ["redirect", "ssrf", "fetch-budget", "no-api"],
      sourceUrl: "https://fixtures.test/import-v2/redirect-source",
      redirectTargetUrl: "https://fixtures.test/import-v2/redirect-target",
      redirectTargetFixture: "fixtures/redirect-target.html",
      redirectPolicy: "follow",
      expectedFetchCount: 2,
      expectedFetchesByUrl: {
        "https://fixtures.test/import-v2/redirect-source": 1,
        "https://fixtures.test/import-v2/redirect-target": 1,
      },
      expectedAiCalls: 0,
      expected: {
        classification: "structured_recipe",
        terminalState: "parsed",
        sourceUrl: "https://fixtures.test/import-v2/redirect-source",
        redirectCount: 1,
        recipe: {
          title: "Redirected Tomato Rice",
          ingredients: ["1 cup rice", "1 tomato"],
          steps: ["Cook the rice with the tomato."],
          sourceUrl: "https://fixtures.test/import-v2/redirect-source",
        },
      },
    },
    {
      id: "ssrf-and-local-network-rejections",
      kind: "url_policy",
      description:
        "Reject unsafe schemes, credentials, local names, and private/link-local IP literals before fetch.",
      tags: ["ssrf", "url-policy", "no-fetch", "no-api"],
      expectedFetchCount: 0,
      expectedAiCalls: 0,
      inputs: [
        { url: "not-a-url", expectedReason: "invalid_url" },
        {
          url: "file:///tmp/recipe.html",
          expectedReason: "unsupported_scheme",
        },
        {
          url: "ftp://fixtures.test/recipe",
          expectedReason: "unsupported_scheme",
        },
        {
          url: "https://user:password@fixtures.test/recipe",
          expectedReason: "userinfo_not_allowed",
        },
        { url: "http://localhost/recipe", expectedReason: "local_hostname" },
        {
          url: "http://service.local/recipe",
          expectedReason: "local_hostname",
        },
        { url: "http://127.0.0.1/recipe", expectedReason: "loopback_ip" },
        { url: "http://[::1]/recipe", expectedReason: "loopback_ip" },
        {
          url: "http://169.254.169.254/latest/meta-data",
          expectedReason: "link_local_ip",
        },
        { url: "http://10.24.8.3/recipe", expectedReason: "private_ip" },
        { url: "http://172.20.4.5/recipe", expectedReason: "private_ip" },
        { url: "http://192.168.1.9/recipe", expectedReason: "private_ip" },
        { url: "http://[fd00::25]/recipe", expectedReason: "private_ip" },
      ],
    },
    {
      id: "duplicate-submission-idempotent",
      kind: "idempotency",
      description:
        "Return one terminal record and one content fetch for two identical submissions.",
      tags: [
        "idempotency",
        "duplicate",
        "source-url-preservation",
        "fetch-budget",
        "no-api",
      ],
      fixture: "fixtures/valid-schema-recipe.html",
      sourceUrl: "https://fixtures.test/import-v2/idempotent",
      userId: "offline-acceptance-user",
      idempotencyKey: "import-v2-duplicate-001",
      submissionCount: 2,
      expected: {
        classification: "structured_recipe",
        terminalState: "parsed",
        sourceUrl: "https://fixtures.test/import-v2/idempotent",
        sameRecord: true,
        recordCount: 1,
        expectedFetchCount: 1,
      },
      expectedAiCalls: 0,
    },
  ],
};
