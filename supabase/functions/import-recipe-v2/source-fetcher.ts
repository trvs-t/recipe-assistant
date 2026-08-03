import { PipelineError } from "./errors.ts";
import {
  DEFAULT_URL_POLICY,
  type HostResolver,
  type UrlPolicy,
  validateSourceUrl,
} from "./url-policy.ts";
import { type SourceDocument, type SourceFetcher } from "./types.ts";

export interface FetchTransport {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export const defaultFetchTransport: FetchTransport = {
  fetch(input: string, init: RequestInit): Promise<Response> {
    return fetch(input, init);
  },
};

export interface SourceFetchOptions {
  readonly policy?: UrlPolicy;
  readonly resolver?: HostResolver;
  readonly transport?: FetchTransport;
}

const SOURCE_HEADERS: Readonly<Record<string, string>> = {
  accept:
    "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1",
  "user-agent": "RecipeAssistantImporter/2.0",
};

export class SafeSourceFetcher implements SourceFetcher {
  private readonly policy: UrlPolicy;
  private readonly resolver: HostResolver | undefined;
  private readonly transport: FetchTransport;

  constructor(options: SourceFetchOptions = {}) {
    this.policy = options.policy ?? DEFAULT_URL_POLICY;
    this.resolver = options.resolver;
    this.transport = options.transport ?? defaultFetchTransport;
  }

  fetch(source_url: string, _attempt: number): Promise<SourceDocument> {
    return fetchSource(source_url, {
      policy: this.policy,
      resolver: this.resolver,
      transport: this.transport,
    });
  }
}

export function createSourceFetcher(
  options: SourceFetchOptions = {},
): SourceFetcher {
  return new SafeSourceFetcher(options);
}

export async function fetchSource(
  source_url: string,
  options: SourceFetchOptions = {},
): Promise<SourceDocument> {
  const policy: UrlPolicy = options.policy ?? DEFAULT_URL_POLICY;
  const transport: FetchTransport = options.transport ?? defaultFetchTransport;
  const resolver: HostResolver | undefined = options.resolver;

  let current: URL = await validateSourceUrl(source_url, policy, resolver);
  const requested_url: string = source_url.trim();
  const visited: Set<string> = new Set<string>([current.toString()]);
  let redirect_count = 0;

  while (true) {
    const response: Response = await fetchOnce(
      current.toString(),
      policy,
      transport,
    );

    if (isRedirectStatus(response.status)) {
      await cancelResponseBody(response);
      if (redirect_count >= policy.max_redirects) {
        throw new PipelineError({
          code: "REDIRECT_LIMIT_EXCEEDED",
          message: "The source URL exceeded the redirect limit",
          stage: "fetch",
          retryable: false,
          details: {
            max_redirects: policy.max_redirects,
          },
        });
      }

      const location: string | null = response.headers.get("location");
      if (location === null || location.trim().length === 0) {
        throw new PipelineError({
          code: "REDIRECT_LOCATION_INVALID",
          message:
            "The source response contained a redirect without a location",
          stage: "fetch",
          retryable: false,
        });
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch (error) {
        throw new PipelineError({
          code: "REDIRECT_LOCATION_INVALID",
          message: "The source response contained an invalid redirect location",
          stage: "fetch",
          retryable: false,
          details: {
            reason: error instanceof Error
              ? error.message
              : "URL parsing failed",
          },
        });
      }

      const validated: URL = await validateSourceUrl(
        next.toString(),
        policy,
        resolver,
      );
      const nextKey: string = validated.toString();
      if (visited.has(nextKey)) {
        throw new PipelineError({
          code: "REDIRECT_LOOP",
          message: "The source response contained a redirect loop",
          stage: "fetch",
          retryable: false,
          details: { redirect_url: nextKey },
        });
      }

      visited.add(nextKey);
      current = validated;
      redirect_count += 1;
      continue;
    }

    if (!response.ok) {
      await cancelResponseBody(response);
      throw new PipelineError({
        code: "HTTP_STATUS_ERROR",
        message: `The source returned HTTP ${response.status}`,
        stage: "fetch",
        retryable: isRetryableHttpStatus(response.status),
        details: { status: response.status },
      });
    }

    const content_type: string | null = response.headers.get("content-type");
    if (!isSupportedContentType(content_type)) {
      await cancelResponseBody(response);
      throw new PipelineError({
        code: "CONTENT_TYPE_UNSUPPORTED",
        message: "The source response is not a supported text document",
        stage: "fetch",
        retryable: false,
        details: { content_type },
      });
    }

    const content_length: string | null = response.headers.get(
      "content-length",
    );
    if (content_length !== null) {
      const parsedLength: number = Number(content_length);
      if (
        Number.isFinite(parsedLength) &&
        parsedLength > policy.max_response_bytes
      ) {
        await cancelResponseBody(response);
        throw new PipelineError({
          code: "RESPONSE_TOO_LARGE",
          message: "The source response is larger than the configured limit",
          stage: "fetch",
          retryable: false,
          details: {
            max_response_bytes: policy.max_response_bytes,
          },
        });
      }
    }

    const body: string = await readBoundedBody(
      response,
      policy.max_response_bytes,
      policy.timeout_ms,
    );
    return {
      source_url: requested_url,
      final_url: current.toString(),
      status: response.status,
      content_type,
      body,
      redirect_count,
    };
  }
}

async function fetchOnce(
  url: string,
  policy: UrlPolicy,
  transport: FetchTransport,
): Promise<Response> {
  const controller: AbortController = new AbortController();
  let timed_out: boolean = false;

  try {
    return await new Promise<Response>((resolve, reject): void => {
      const timeout_id: ReturnType<typeof setTimeout> = setTimeout((): void => {
        timed_out = true;
        controller.abort();
        reject(new Error("Source fetch timed out"));
      }, policy.timeout_ms);

      try {
        const responsePromise: Promise<Response> = transport.fetch(url, {
          method: "GET",
          headers: SOURCE_HEADERS,
          redirect: "manual",
          signal: controller.signal,
        });
        responsePromise.then(
          (response: Response): void => {
            clearTimeout(timeout_id);
            resolve(response);
          },
          (error: unknown): void => {
            clearTimeout(timeout_id);
            reject(error);
          },
        );
      } catch (error) {
        clearTimeout(timeout_id);
        reject(error);
      }
    });
  } catch (error) {
    if (timed_out || isAbortError(error)) {
      throw new PipelineError({
        code: "FETCH_TIMEOUT",
        message: "The source fetch exceeded its timeout",
        stage: "fetch",
        retryable: true,
      });
    }

    throw new PipelineError({
      code: "FETCH_NETWORK_ERROR",
      message: "The source could not be fetched",
      stage: "fetch",
      retryable: true,
      details: {
        reason: error instanceof Error
          ? error.message
          : "Network request failed",
      },
    });
  }
}

async function readBoundedBody(
  response: Response,
  max_response_bytes: number,
  timeout_ms: number,
): Promise<string> {
  if (response.body === null) {
    return "";
  }

  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body
    .getReader();
  const decoder: TextDecoder = new TextDecoder();
  let total_bytes: number = 0;
  let body: string = "";
  const deadline: number = Date.now() + timeout_ms;

  try {
    while (true) {
      const remaining_ms: number = deadline - Date.now();
      if (remaining_ms <= 0) {
        throw new PipelineError({
          code: "FETCH_TIMEOUT",
          message: "The source response body exceeded its timeout",
          stage: "fetch",
          retryable: true,
        });
      }
      const chunk: ReadableStreamReadResult<Uint8Array> =
        await readChunkWithTimeout(
          reader,
          remaining_ms,
        );
      if (chunk.done) {
        body += decoder.decode();
        return body;
      }

      total_bytes += chunk.value.byteLength;
      if (total_bytes > max_response_bytes) {
        await reader.cancel().catch((): undefined => undefined);
        throw new PipelineError({
          code: "RESPONSE_TOO_LARGE",
          message: "The source response is larger than the configured limit",
          stage: "fetch",
          retryable: false,
          details: { max_response_bytes },
        });
      }

      body += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }

    throw new PipelineError({
      code: "FETCH_NETWORK_ERROR",
      message: "The source response body could not be read",
      stage: "fetch",
      retryable: true,
      details: {
        reason: error instanceof Error
          ? error.message
          : "Response body read failed",
      },
    });
  }
}

function readChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeout_ms: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject): void => {
      let settled: boolean = false;
      const timeout_id: ReturnType<typeof setTimeout> = setTimeout((): void => {
        settled = true;
        try {
          void reader.cancel().catch((): undefined => undefined);
        } catch (error) {
          void error;
        }
        reject(
          new PipelineError({
            code: "FETCH_TIMEOUT",
            message: "The source response body exceeded its timeout",
            stage: "fetch",
            retryable: true,
          }),
        );
      }, timeout_ms);

      try {
        const readPromise: Promise<ReadableStreamReadResult<Uint8Array>> =
          reader.read();
        readPromise.then(
          (chunk: ReadableStreamReadResult<Uint8Array>): void => {
            if (settled) {
              return;
            }
            clearTimeout(timeout_id);
            settled = true;
            resolve(chunk);
          },
          (error: unknown): void => {
            if (settled) {
              return;
            }
            clearTimeout(timeout_id);
            settled = true;
            reject(error);
          },
        );
      } catch (error) {
        clearTimeout(timeout_id);
        settled = true;
        reject(error);
      }
    },
  );
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body !== null) {
    await response.body.cancel().catch((): undefined => undefined);
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 ||
    status === 308;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isSupportedContentType(content_type: string | null): boolean {
  if (content_type === null || content_type.trim().length === 0) {
    return true;
  }

  const mediaType: string = content_type.split(";")[0]?.trim().toLowerCase() ??
    "";
  return mediaType === "text/html" ||
    mediaType === "application/xhtml+xml" ||
    mediaType === "text/plain" ||
    mediaType === "application/json";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
