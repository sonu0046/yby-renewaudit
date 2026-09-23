import { redactPII } from "../security/pii/redact";

self.onmessage = (event: MessageEvent<{ type: "REDACT"; text: string }>) => {
  if (event.data.type === "REDACT") {
    self.postMessage({ type: "REDACTED", text: redactPII(event.data.text) });
  }
};
