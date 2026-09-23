export function isAllowedClausePayload(body: unknown): body is { snippet: string } {
  return typeof body === "object" && body !== null &&
    "snippet" in body && typeof (body as { snippet?: unknown }).snippet === "string";
}
