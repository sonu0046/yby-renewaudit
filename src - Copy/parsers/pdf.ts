import * as pdfjsLib from "pdfjs-dist";

export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        pages.push(content.items.map((item: any) => "str" in item ? item.str : "").join(" "));
      } finally {
        page.cleanup();
      }
    }
    return pages.join("\n");
  } finally {
    await doc.destroy();
  }
}
