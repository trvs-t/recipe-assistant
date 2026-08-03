import { PipelineError } from "../errors.ts";
import {
  DEFAULT_URL_POLICY,
  type HostResolver,
  validateSourceUrl,
} from "../url-policy.ts";
import { assertEquals, assertRejects } from "./assertions.ts";

const publicResolver: HostResolver = {
  async resolve(_hostname: string): Promise<readonly string[]> {
    return ["93.184.216.34"];
  },
};

Deno.test("rejects localhost and private IPv4 source URLs", async () => {
  await assertRejects(
    () =>
      validateSourceUrl(
        "http://localhost/recipe",
        DEFAULT_URL_POLICY,
        publicResolver,
      ),
    "SSRF_BLOCKED",
  );
  await assertRejects(
    () =>
      validateSourceUrl(
        "http://127.0.0.1/recipe",
        DEFAULT_URL_POLICY,
        publicResolver,
      ),
    "SSRF_BLOCKED",
  );
  await assertRejects(
    () =>
      validateSourceUrl(
        "http://169.254.169.254/latest",
        DEFAULT_URL_POLICY,
        publicResolver,
      ),
    "SSRF_BLOCKED",
  );
});

Deno.test("rejects unsafe protocols, credentials, and ports", async () => {
  await assertRejects(
    () =>
      validateSourceUrl(
        "file:///etc/passwd",
        DEFAULT_URL_POLICY,
        publicResolver,
      ),
    "UNSUPPORTED_PROTOCOL",
  );
  await assertRejects(
    () =>
      validateSourceUrl(
        "https://user:password@example.com/recipe",
        DEFAULT_URL_POLICY,
        publicResolver,
      ),
    "URL_CREDENTIALS_NOT_ALLOWED",
  );
  await assertRejects(
    () =>
      validateSourceUrl(
        "https://example.com:8080/recipe",
        DEFAULT_URL_POLICY,
        publicResolver,
      ),
    "URL_PORT_NOT_ALLOWED",
  );
});

Deno.test("allows a public hostname when all resolved addresses are public", async () => {
  const url: URL = await validateSourceUrl(
    "https://example.com/recipe",
    DEFAULT_URL_POLICY,
    publicResolver,
  );
  assertEquals(url.hostname, "example.com");
});

Deno.test("rejects a public hostname when DNS includes a private address", async () => {
  const mixedResolver: HostResolver = {
    async resolve(_hostname: string): Promise<readonly string[]> {
      return ["93.184.216.34", "10.0.0.2"];
    },
  };
  await assertRejects(
    () =>
      validateSourceUrl(
        "https://mixed.example/recipe",
        DEFAULT_URL_POLICY,
        mixedResolver,
      ),
    "SSRF_BLOCKED",
  );
});

Deno.test("retry classification remains distinct from SSRF rejection", () => {
  const timeoutError: PipelineError = new PipelineError({
    code: "FETCH_TIMEOUT",
    message: "timeout",
    stage: "fetch",
    retryable: true,
  });
  assertEquals(timeoutError.retryable, true);
});
