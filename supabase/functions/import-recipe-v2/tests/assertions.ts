export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEquals<T>(
  actual: T,
  expected: T,
  message?: string,
): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ?? `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

export function assertDeepEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  const actualJson: string = JSON.stringify(actual);
  const expectedJson: string = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, received ${actualJson}`,
    );
  }
}

export async function assertRejects(
  operation: () => Promise<unknown>,
  expectedCode?: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (expectedCode !== undefined) {
      const code: unknown = isRecord(error) ? error["code"] : undefined;
      assertEquals(code, expectedCode, "Unexpected error code");
    }
    return;
  }
  throw new Error("Expected the operation to reject");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
