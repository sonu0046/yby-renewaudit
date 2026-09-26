if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
  };
}

if (typeof (Uint8Array.prototype as any).toHex === "undefined") {
  (Uint8Array.prototype as any).toHex = function () {
    return Array.from(this as unknown as ArrayLike<number>)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
  };
}

import * as pdfWorkerModule from "pdfjs-dist/build/pdf.worker.min.mjs";
(globalThis as any).pdfjsWorker = pdfWorkerModule;
