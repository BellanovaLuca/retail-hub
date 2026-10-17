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
