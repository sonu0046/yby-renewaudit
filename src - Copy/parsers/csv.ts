import Papa from "papaparse";

export function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}
