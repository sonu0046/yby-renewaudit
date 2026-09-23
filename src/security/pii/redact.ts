const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)\b/g;

export function redactPII(input: string): string {
  return input
    .replace(EMAIL, "[REDACTED]")
    .replace(PHONE, "[REDACTED]");
}

