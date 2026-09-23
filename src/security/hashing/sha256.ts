export async function sha256(input: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = (input instanceof Uint8Array ? input : new Uint8Array(input)) as BufferSource;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

