import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { addDays, format, getISOWeek, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { createElement, type ReactElement } from "react";
import { BoardPdf } from "@/components/responsibilities/board-pdf";
import { getCurrentProfile } from "@/lib/auth/session";
import { getBoard } from "@/lib/data/responsibilities";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { nowInRome, toISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export PDF del tabellone delle responsabilità (A4 orizzontale) da appendere in negozio.
 * `?settimana=yyyy-MM-dd` (qualsiasi giorno della settimana; default la corrente).
 * Il tabellone è leggibile da tutti, ma il pulsante è nell'area admin.
 */
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) {
    return new Response("Accesso richiesto.", { status: 401 });
  }

  const url = new URL(request.url);
  const now = nowInRome();
  const week = normalizeWeekParam(url.searchParams.get("settimana") ?? undefined, now);
  const supabase = await createClient();
  const [board, { data: settings }] = await Promise.all([
    getBoard(supabase, week, toISODate(now)),
    supabase.from("store_settings").select("store_name").eq("id", true).maybeSingle(),
  ]);

  const monday = parseISO(week);
  const sunday = addDays(monday, 6);
  const title = `Responsabilità · Week ${getISOWeek(monday)} · ${format(monday, "d MMM", { locale: it })} – ${format(sunday, "d MMM yyyy", { locale: it })}`;
  const storeName = settings?.store_name ?? "Salmoiraghi & Viganò — Piazza Cordusio";

  const element = createElement(BoardPdf, {
    board,
    title,
    storeName,
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="responsabilita-${week}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
