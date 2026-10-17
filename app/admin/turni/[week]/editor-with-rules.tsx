"use client";

import { AlertTriangle, EyeOff, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import type { FooterRow } from "@/components/spreadsheet";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { CoverageSlot } from "@/lib/coverage";
import type { Violation } from "@/lib/rules/types";
import { ignoreViolation, restoreViolation } from "@/app/admin/impostazioni/regole/actions";
import { ShiftEditor, type EditorProps } from "./shift-editor";

export type DayCoverage = Record<
  string,
  { min: { vista: number; sole: number; delta: number }; copOtt: boolean; slots: CoverageSlot[] }
>;

/** Editor turni con gli avvisi delle regole: pannello laterale, celle, riepiloghi, pubblicazione (§7.3). */
export function EditorWithRules({
  violations,
  ignored,
  ruleNames,
  coverage,
  ...props
}: Omit<
  EditorProps,
  "sidePanelExtra" | "cellWarning" | "footerExtra" | "warningsCount" | "warningsList"
> & {
  violations: Violation[];
  ignored: { id: string; ruleId: string; date: string | null; note: string }[];
  ruleNames: Record<string, string>;
  coverage: DayCoverage;
}) {
  const warnings = violations.filter((v) => v.severity === "warning");

  const byPersonDay = useMemo(() => {
    const map = new Map<string, string[]>();
    // Solo le violazioni di un giorno preciso: quelle settimanali (ore di contratto, riposi)
    // stanno nel pannello laterale e nella colonna delle ore, non su ogni cella.
    for (const v of violations) {
      if (!v.profileId || !v.date || v.severity !== "warning") continue;
      const k = `${v.profileId}|${v.date}`;
      map.set(k, [...(map.get(k) ?? []), v.message]);
    }
    return map;
  }, [violations]);

  const cellWarning = useCallback(
    (profileId: string, date: string) => byPersonDay.get(`${profileId}|${date}`)?.join("\n"),
    [byPersonDay],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Violation[]>();
    for (const v of violations)
      if (v.date && !v.profileId) map.set(v.date, [...(map.get(v.date) ?? []), v]);
    return map;
  }, [violations]);

  const slotWarning = useCallback(
    (date: string, start: string) => {
      const hits = (byDay.get(date) ?? []).filter(
        (v) => v.severity === "warning" && v.start && v.end && v.start <= start && start < v.end,
      );
      return hits.length ? hits.map((v) => v.message).join("\n") : undefined;
    },
    [byDay],
  );

  const footerExtra: FooterRow[] = useMemo(
    () => [
      {
        id: "copertura",
        label: "Copertura",
        cells: Object.fromEntries(
          props.days.map((d) => {
            const c = coverage[d];
            const list = byDay.get(d) ?? [];
            if (!c) return [d, "—"];
            return [
              d,
              <span
                key={d}
                className="nums"
                title={list.map((v) => v.message).join("\n") || undefined}
              >
                V {c.min.vista} · S {c.min.sole} · Ott {c.copOtt ? "✓" : "✗"}
                {list.length ? ` · ${list.length}!` : ""}
              </span>,
            ];
          }),
        ),
        cellClassName: (d) =>
          (byDay.get(d) ?? []).some((v) => v.severity === "warning")
            ? "bg-danger/8 text-danger"
            : undefined,
      },
    ],
    [props.days, coverage, byDay],
  );

  return (
    <ShiftEditor
      {...props}
      cellWarning={cellWarning}
      slotWarning={slotWarning}
      footerExtra={footerExtra}
      warningsCount={warnings.length}
      warningsList={<ViolationList violations={warnings.slice(0, 8)} />}
      sidePanelExtra={
        <ViolationsPanel
          weekId={props.week.id}
          violations={violations}
          ignored={ignored}
          ruleNames={ruleNames}
        />
      }
    />
  );
}

function ViolationList({ violations }: { violations: Violation[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted">
      {violations.map((v, i) => (
        <li key={i}>{v.message}</li>
      ))}
    </ul>
  );
}

function ViolationsPanel({
  weekId,
  violations,
  ignored,
  ruleNames,
}: {
  weekId: string;
  violations: Violation[];
  ignored: { id: string; ruleId: string; date: string | null; note: string }[];
  ruleNames: Record<string, string>;
}) {
  const router = useRouter();
  const [ignoring, setIgnoring] = useState<Violation | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const warnings = violations.filter((v) => v.severity === "warning");
  const infos = violations.filter((v) => v.severity === "info");

  function focusCell(v: Violation) {
    if (!v.date) return;
    const selector = v.profileId
      ? `[data-row-id="${v.profileId}"][data-col-id="${v.date}"]`
      : `[data-col-id="${v.date}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    el?.focus();
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 eyebrow">
        <AlertTriangle className="size-4 stroke-[1.5]" aria-hidden />
        Avvisi {warnings.length ? `(${warnings.length})` : ""}
      </h2>
      {warnings.length === 0 ? (
        <p className="text-sm text-muted">
          Nessun avviso: le regole della settimana sono rispettate.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-line overflow-y-auto border-y border-line">
          {warnings.map((v, i) => (
            <li key={i} className="group py-2">
              <button
                type="button"
                onClick={() => focusCell(v)}
                className="text-left text-sm text-danger hover:underline"
              >
                {v.message}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIgnoring(v);
                  setNote("");
                  setResult(null);
                }}
                className="mt-1 flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <EyeOff className="size-3 stroke-[1.5]" aria-hidden /> Ignora per questa settimana
              </button>
              {ignoring === v ? (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    startTransition(async () => {
                      const res = await ignoreViolation({
                        weekId,
                        ruleId: v.ruleId,
                        date: v.date ?? null,
                        note,
                      });
                      setResult(res);
                      if (res.ok) {
                        setIgnoring(null);
                        router.refresh();
                      }
                    });
                  }}
                >
                  <Input
                    aria-label="Motivo"
                    placeholder="Es. inventario"
                    className="h-9"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                    Ok
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <FormMessage result={result} />
      {infos.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">
            Informazioni ({infos.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
            {infos.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {ignored.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">
            Avvisi ignorati ({ignored.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2 text-xs">
            {ignored.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-2">
                <span>
                  {ruleNames[o.ruleId] ?? "Regola"}
                  {o.date ? ` · ${o.date.slice(8)}/${o.date.slice(5, 7)}` : " · tutta la settimana"}
                  <span className="block text-muted">{o.note}</span>
                </span>
                <button
                  type="button"
                  aria-label="Ripristina avviso"
                  className="text-muted hover:text-foreground"
                  onClick={() =>
                    startTransition(async () => {
                      await restoreViolation(o.id);
                      router.refresh();
                    })
                  }
                >
                  <RotateCcw className="size-3.5 stroke-[1.5]" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
