/** Risposte HTTP degli export: content-type e nome del file scaricato. */
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";

export function fileResponse(body: Buffer, type: string, filename: string): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Pezzo di nome file sicuro per `Content-Disposition`: solo `a-z`, `0-9` e trattini (gli accenti
 * si tolgono). Un nome scelto dall'admin (es. il reparto) può contenere virgolette o caratteri
 * fuori Latin-1, che romperebbero l'intestazione.
 */
export function fileSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
