import { PipelineError } from "../errors.ts";
import { fetchSource, type FetchTransport } from "../source-fetcher.ts";
import { DEFAULT_URL_POLICY, type HostResolver } from "../url-policy.ts";
import { assertEquals, assertRejects } from "./assertions.ts";

const publicResolver: HostResolver = {
  async resolve(_hostname: string): Promise<readonly string[]> {
    return ["93.184.216.34"];
  },
};

Deno.test("fetches the source URL exactly once and uses manual redirects", async () => {
  let calls: number = 0;
  let lastRedirect: string | null = null;
  const transport: FetchTransport = {
    async fetch(_input: string, init: RequestInit): Promise<Response> {
      calls += 1;
      lastRedirect = init.redirect === undefined ? null : String(init.redirect);
      return new Response("<html><h1>Recipe</h1></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  };

  const document = await fetchSource("https://example.com/recipe", {
    policy: DEFAULT_URL_POLICY,
    resolver: publicResolver,
    transport,
  });

  assertEquals(calls, 1);
  assertEquals(lastRedirect, "manual");
  assertEquals(document.body, "<html><h1>Recipe</h1></html>");
  assertEquals(document.redirect_count, 0);
});

Deno.test("validates every redirect before making the next fetch", async () => {
  let calls: number = 0;
  const transport: FetchTransport = {
    async fetch(_input: string, _init: RequestInit): Promise<Response> {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      });
    },
  };

  await assertRejects(
    () =>
      fetchSource("https://example.com/recipe", {
        policy: DEFAULT_URL_POLICY,
        resolver: publicResolver,
        transport,
      }),
    "SSRF_BLOCKED",
  );
  assertEquals(calls, 1);
});

Deno.test("bounds redirects and rejects redirect loops", async () => {
  let calls: number = 0;
  const transport: FetchTransport = {
    async fetch(input: string, _init: RequestInit): Promise<Response> {
      calls += 1;
      const next: string = input.endsWith("/one")
        ? "https://example.com/two"
        : "https://example.com/one";
      return new Response(null, { status: 302, headers: { location: next } });
    },
  };

  await assertRejects(
    () =>
      fetchSource("https://example.com/one", {
        policy: { ...DEFAULT_URL_POLICY, max_redirects: 5 },
        resolver: publicResolver,
        transport,
      }),
    "REDIRECT_LOOP",
  );
  assertEquals(calls, 2);
});

Deno.test("maps transport failures to retryable structured errors", async () => {
  const transport: FetchTransport = {
    async fetch(_input: string, _init: RequestInit): Promise<Response> {
      throw new Error("connection reset");
    },
  };

  try {
    await fetchSource("https://example.com/recipe", {
      resolver: publicResolver,
      transport,
    });
  } catch (error) {
    if (!(error instanceof PipelineError)) {
      throw new Error("Expected a PipelineError");
    }
    assertEquals(error.code, "FETCH_NETWORK_ERROR");
    assertEquals(error.retryable, true);
    return;
  }
  throw new Error("Expected fetchSource to reject");
});

Deno.test("bounds response body reads with the fetch timeout", async () => {
  const hangingBody: ReadableStream<Uint8Array> = new ReadableStream<
    Uint8Array
  >({
    pull(): Promise<void> {
      return new Promise<void>(() => undefined);
    },
  });
  const transport: FetchTransport = {
    fetch(_input: string, _init: RequestInit): Promise<Response> {
      return Promise.resolve(
        new Response(hangingBody, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    },
  };

  await assertRejects(
    () =>
      fetchSource("https://example.com/recipe", {
        policy: { ...DEFAULT_URL_POLICY, timeout_ms: 5 },
        resolver: publicResolver,
        transport,
      }),
    "FETCH_TIMEOUT",
  );
});

Deno.test("bounds response bytes before returning source content", async () => {
  const transport: FetchTransport = {
    fetch(_input: string, _init: RequestInit): Promise<Response> {
      return Promise.resolve(
        new Response("0123456789", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    },
  };

  await assertRejects(
    () =>
      fetchSource("https://example.com/recipe", {
        policy: { ...DEFAULT_URL_POLICY, max_response_bytes: 4 },
        resolver: publicResolver,
        transport,
      }),
    "RESPONSE_TOO_LARGE",
  );
});
