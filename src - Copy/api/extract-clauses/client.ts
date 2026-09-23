export async function extractClauses(sanitizedSnippet: string): Promise<unknown> {
  // V1 boundary: only sanitized, minimal text is allowed.
  const response = await fetch("/api/extract-clauses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: sanitizedSnippet })
  });
  if (!response.ok) throw new Error("Clause extraction failed.");
  return response.json();
}
