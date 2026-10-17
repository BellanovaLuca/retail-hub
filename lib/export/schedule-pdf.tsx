/**
 * Export PDF dei turni (§8.1) con @react-pdf/renderer e i font standard Helvetica.
 * Puro rispetto ai dati: riceve i modelli già costruiti.
 *
 * - `renderGridPdf`: A4 orizzontale, griglia persone × giorni (stampa per la bacheca).
 * - `renderWeekPdf`: A4 verticale, UNA pagina per settimana, come i fogli "Week 39/40":
 *   7 blocchi giorno, mezze celle nere (back office a righe), righe ORARIO/TOT, indicatori.
 */
import {
  Document,
  Line,
  Page,
  Polyline,
  renderToBuffer,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatHours } from "@/lib/hours";
import type { SlotMark } from "@/lib/shifts/slots";
import type { ScheduleGridModel } from "./schedule-grid";
import {
  isSlotOutsideOpening,
  TIMESHEET_HOURS,
  type LeaveFill,
  type TimesheetModel,
} from "./timesheet-model";

const C = {
  black: "#0A0A0A",
  white: "#FFFFFF",
  surface: "#F5F5F4",
  line: "#D6D3D1",
  lineStrong: "#A8A29E",
  muted: "#57534E",
  danger: "#B42318",
  vista: "#DDE2E8",
  sole: "#F4ECE2",
};

const LEAVE_BG: Record<LeaveFill, string> = {
  ferie: "#F6DEDC",
  request: "#DAEDE3",
  pending: "#EFF7F2",
  other: "#E7E5E4",
};

const zoneBg = (zone: string) =>
  zone === "vista" ? C.vista : zone === "sole" ? C.sole : C.surface;

// ---------------------------------------------------------------------------------------------
// Griglia persone × giorni (A4 orizzontale)
// ---------------------------------------------------------------------------------------------

const g = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 8, color: C.black },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  brand: { fontSize: 7, letterSpacing: 1.5, color: C.muted, marginBottom: 4 },
  title: { fontSize: 22, fontFamily: "Helvetica" },
  subtitle: { fontSize: 8, color: C.muted, marginTop: 2 },
  table: { marginTop: 14, borderTopWidth: 1, borderTopColor: C.black },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, minHeight: 15 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.black },
  groupRow: { backgroundColor: C.surface, paddingVertical: 3, paddingHorizontal: 4 },
  groupLabel: { fontSize: 6.5, letterSpacing: 1, color: C.muted, fontFamily: "Helvetica-Bold" },
  name: { paddingHorizontal: 4, paddingVertical: 3, justifyContent: "center" },
  cell: {
    paddingHorizontal: 3,
    paddingVertical: 3,
    borderLeftWidth: 0.5,
    borderLeftColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  th: { fontSize: 6.5, letterSpacing: 0.8, color: C.muted, fontFamily: "Helvetica-Bold" },
  thSub: { fontSize: 6.5, color: C.muted },
  footer: {
    flexDirection: "row",
    minHeight: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  printed: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 6, color: C.muted },
});

function GridDocument({ model, printedAt }: { model: ScheduleGridModel; printedAt: string }) {
  const nameW = 120;
  const hoursW = model.showHours ? 56 : 0;
  const dayW = (842 - 56 - nameW - hoursW) / model.days.length;
  return (
    <Document title={`Turni · ${model.title}`} author="Portale Staff Cordusio">
      <Page size="A4" orientation="landscape" style={g.page}>
        <View style={g.head}>
          <View>
            <Text style={g.brand}>SALMOIRAGHI &amp; VIGANÒ · CORDUSIO</Text>
            <Text style={g.title}>{model.title}</Text>
            <Text style={g.subtitle}>{model.subtitle}</Text>
          </View>
        </View>

        <View style={g.table}>
          <View style={g.headerRow} fixed>
            <View style={[g.name, { width: nameW }]}>
              <Text style={g.th}>PERSONA</Text>
            </View>
            {model.days.map((d) => (
              <View key={d.date} style={[g.cell, { width: dayW, borderLeftWidth: 0 }]}>
                <Text style={g.th}>{d.label.toUpperCase()}</Text>
                <Text style={g.thSub}>{d.sublabel}</Text>
              </View>
            ))}
            {model.showHours ? (
              <View style={[g.cell, { width: hoursW, borderLeftWidth: 0 }]}>
                <Text style={g.th}>ORE</Text>
              </View>
            ) : null}
          </View>

          {model.groups.map((group) => (
            <View key={group.label} wrap={false}>
              <View style={g.groupRow}>
                <Text style={g.groupLabel}>{group.label.toUpperCase()}</Text>
              </View>
              {group.rows.map((row) => (
                <View key={row.id} style={g.row}>
                  <View style={[g.name, { width: nameW }]}>
                    <Text>{row.name}</Text>
                  </View>
                  {row.cells.map((cell, i) => (
                    <View
                      key={model.days[i].date}
                      style={[
                        g.cell,
                        { width: dayW },
                        cell.tone === "absence" ? { backgroundColor: "#E7E5E4" } : {},
                        cell.tone === "closed" ? { backgroundColor: C.surface } : {},
                      ]}
                    >
                      <Text style={cell.tone === "absence" ? { color: C.muted } : {}}>
                        {cell.text}
                      </Text>
                    </View>
                  ))}
                  {model.showHours ? (
                    <View style={[g.cell, { width: hoursW }]}>
                      <Text style={{ fontSize: 7, color: C.muted }}>{row.hours ?? ""}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ))}

          {model.footer.map((f) => (
            <View key={f.label} style={g.footer}>
              <View style={[g.name, { width: nameW }]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{f.label}</Text>
              </View>
              {f.cells.map((v, i) => (
                <View
                  key={model.days[i].date}
                  style={[g.cell, { width: dayW, borderLeftWidth: 0 }]}
                >
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{v}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={g.printed} fixed>
          Stampato il {printedAt}
        </Text>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------------------------
// Foglio orario "Week" (A4 verticale, una pagina)
// ---------------------------------------------------------------------------------------------

const PAGE_W = 595.28;
const MARGIN = 12;
const DATE_W = 10;
const HOUR_W = 16;
const IND_W = 14;
const HALF_H = 3.15;
const LABEL_ROW_H = 6.2;

const w = StyleSheet.create({
  page: { padding: MARGIN, fontFamily: "Helvetica", fontSize: 5, color: C.black },
  row: { flexDirection: "row" },
  cellText: { fontSize: 5, lineHeight: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  center: { alignItems: "center", justifyContent: "center" },
});

function Hatch({ width, height }: { width: number; height: number }) {
  const lines = [];
  for (let x = -height; x < width; x += 2.2) {
    lines.push(
      <Line key={x} x1={x} y1={height} x2={x + height} y2={0} stroke={C.black} strokeWidth={0.4} />,
    );
  }
  return (
    <Svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
      {lines}
    </Svg>
  );
}

/** ✓ / ✗ disegnati (i font standard non hanno questi glifi). Fuori orario la ✗ è grigia. */
function Tick({ ok, muted }: { ok: boolean; muted: boolean }) {
  const red = muted ? C.lineStrong : C.danger;
  return (
    <Svg width={4} height={4}>
      {ok ? (
        <Polyline points="0.4,2.2 1.6,3.5 3.6,0.6" stroke={C.black} strokeWidth={0.6} fill="none" />
      ) : (
        <>
          <Line x1={0.5} y1={0.5} x2={3.5} y2={3.5} stroke={red} strokeWidth={0.6} />
          <Line x1={3.5} y1={0.5} x2={0.5} y2={3.5} stroke={red} strokeWidth={0.6} />
        </>
      )}
    </Svg>
  );
}

function HalfCell({
  mark,
  width,
  bg,
  bottom,
}: {
  mark: SlotMark;
  width: number;
  bg: string;
  bottom: boolean;
}) {
  return (
    <View
      style={{
        width,
        height: HALF_H,
        backgroundColor: mark === "sale" ? C.black : bg,
        borderBottomWidth: bottom ? 0.3 : 0,
        borderBottomColor: C.line,
        position: "relative",
      }}
    >
      {mark === "bo" ? <Hatch width={width} height={HALF_H} /> : null}
    </View>
  );
}

function WeekDocument({ model }: { model: TimesheetModel }) {
  const n = Math.max(model.columns.length, 1);
  const personW = (PAGE_W - 2 * MARGIN - DATE_W - HOUR_W - 5 * IND_W) / n;
  const indicatorsW = 5 * IND_W;
  const border = { borderRightWidth: 0.3, borderRightColor: C.line };

  return (
    <Document title={`Week ${model.weekNumber}`} author="Portale Staff Cordusio">
      <Page size="A4" orientation="portrait" style={w.page} wrap={false}>
        {/* Intestazione: numero settimana, aree, sigle, ore di contratto. */}
        <View style={w.row}>
          <View style={[w.center, { width: DATE_W + HOUR_W, height: 18 }]}>
            <Text style={[w.bold, { fontSize: 12 }]}>{model.weekNumber}</Text>
          </View>
          <View>
            <View style={w.row}>
              {model.groups.map((grp) => (
                <View
                  key={grp.zone}
                  style={[
                    w.center,
                    { width: grp.span * personW, height: 6, backgroundColor: zoneBg(grp.zone) },
                  ]}
                >
                  <Text style={[w.cellText, w.bold]}>{grp.label.toUpperCase()}</Text>
                </View>
              ))}
            </View>
            <View style={w.row}>
              {model.columns.map((col) => (
                <View
                  key={col.id}
                  style={[
                    w.center,
                    border,
                    { width: personW, height: 7, backgroundColor: zoneBg(col.zone) },
                  ]}
                >
                  <Text style={[w.cellText, w.bold, { fontSize: 4.6 }]}>{col.shortLabel}</Text>
                </View>
              ))}
            </View>
            <View style={w.row}>
              {model.columns.map((col, i) => (
                <View key={col.id} style={[w.center, { width: personW, height: 5 }]}>
                  <Text style={[w.cellText, { color: C.muted, fontSize: 4.5 }]}>
                    {model.contract[i] ?? ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ width: indicatorsW }}>
            <View style={[w.center, { height: 6 }]}>
              <Text style={[w.cellText, w.bold]}>{formatHours(model.contractTotal)} h</Text>
            </View>
            <View style={w.row}>
              {["COP. OTT.", "DELTA", "TESTE", "VISTA", "SOLE"].map((label, i) => (
                <View
                  key={label}
                  style={[
                    w.center,
                    border,
                    {
                      width: IND_W,
                      height: 7,
                      backgroundColor: i === 3 ? C.vista : i === 4 ? C.sole : C.white,
                    },
                  ]}
                >
                  <Text style={[w.cellText, w.bold, { fontSize: i === 0 ? 3.2 : 3.8 }]}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {model.days.map((day) => (
          <View
            key={day.date}
            style={[
              w.row,
              {
                marginTop: 2.2,
                borderTopWidth: 0.6,
                borderTopColor: C.black,
                opacity: day.closed ? 0.45 : 1,
              },
            ]}
          >
            {/* Data in verticale. */}
            <View
              style={[
                w.center,
                { width: DATE_W, borderRightWidth: 0.6, borderRightColor: C.black },
              ]}
            >
              {/* Rotazione di -90°: la data si legge dal basso verso l'alto, come nei fogli. */}
              <Text
                style={[
                  w.bold,
                  { fontSize: 5.5, width: 100, textAlign: "center", transform: "rotate(-90deg)" },
                ]}
              >
                {day.label.toUpperCase()}
                {day.closed ? " · CHIUSO" : ""}
              </Text>
            </View>

            <View>
              {/* ORARIO */}
              <View style={[w.row, { height: LABEL_ROW_H, borderBottomWidth: 0.4 }]}>
                <View style={[{ width: HOUR_W, justifyContent: "center", paddingLeft: 1 }]}>
                  <Text style={[w.cellText, w.bold, { fontSize: 4.4 }]}>ORARIO</Text>
                </View>
                {day.residual.map((v, i) => (
                  <View key={i} style={[w.center, border, { width: personW }]}>
                    <Text
                      style={[
                        w.cellText,
                        w.bold,
                        {
                          color: v !== null && v < 0 ? C.danger : v === 0 ? C.muted : C.black,
                        },
                      ]}
                    >
                      {v === null ? "" : formatHours(v)}
                    </Text>
                  </View>
                ))}
                <View style={{ width: indicatorsW }} />
              </View>

              {/* Ore 07–22 */}
              {TIMESHEET_HOURS.map((hour, h) => {
                const ind = day.indicators[h];
                const outside =
                  isSlotOutsideOpening(h * 2, day.opening) &&
                  isSlotOutsideOpening(h * 2 + 1, day.opening);
                return (
                  <View key={hour} style={w.row}>
                    <View style={[{ width: HOUR_W, justifyContent: "center", paddingLeft: 1 }]}>
                      <Text style={[w.cellText, { color: C.muted, fontSize: 4.4 }]}>
                        {String(hour).padStart(2, "0")}-{String(hour + 1).padStart(2, "0")}
                      </Text>
                    </View>
                    {day.cells[h].map((cell, i) => {
                      const leave = day.leaves[i];
                      const bgFor = (slot: number) =>
                        leave
                          ? LEAVE_BG[leave.fill]
                          : isSlotOutsideOpening(slot, day.opening)
                            ? C.surface
                            : C.white;
                      return (
                        <View key={i} style={[border, { width: personW }]}>
                          <HalfCell
                            mark={leave ? null : cell.marks[0]}
                            width={personW - 0.3}
                            bg={bgFor(h * 2)}
                            bottom={false}
                          />
                          <HalfCell
                            mark={leave ? null : cell.marks[1]}
                            width={personW - 0.3}
                            bg={bgFor(h * 2 + 1)}
                            bottom
                          />
                        </View>
                      );
                    })}
                    {[null, ind.delta, ind.teste, ind.vista, ind.sole].map((v, i) => (
                      <View
                        key={i}
                        style={[
                          w.center,
                          border,
                          {
                            width: IND_W,
                            height: HALF_H * 2,
                            borderBottomWidth: 0.3,
                            borderBottomColor: C.line,
                          },
                        ]}
                      >
                        {i === 0 ? (
                          <Tick ok={ind.copOtt} muted={outside} />
                        ) : (
                          <Text style={[w.cellText, { fontSize: 4.6 }]}>{v}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })}

              {/* TOT */}
              <View
                style={[
                  w.row,
                  { height: LABEL_ROW_H, borderTopWidth: 0.4, borderTopColor: C.black },
                ]}
              >
                <View style={[{ width: HOUR_W, justifyContent: "center", paddingLeft: 1 }]}>
                  <Text style={[w.cellText, w.bold, { fontSize: 4.4 }]}>TOT</Text>
                </View>
                {day.tot.map((v, i) => {
                  const leave = day.leaves[i];
                  return (
                    <View
                      key={i}
                      style={[
                        w.center,
                        border,
                        { width: personW },
                        leave ? { backgroundColor: LEAVE_BG[leave.fill] } : {},
                      ]}
                    >
                      <Text style={[w.cellText, w.bold, { fontSize: leave ? 3.8 : 5 }]}>
                        {leave ? leave.label.toUpperCase() : v ? formatHours(v) : ""}
                      </Text>
                    </View>
                  );
                })}
                <View style={[w.center, { width: indicatorsW }]}>
                  <Text style={[w.cellText, w.bold]}>{formatHours(day.total)}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderGridPdf(
  model: ScheduleGridModel,
  printedAt = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
): Promise<Buffer> {
  return renderToBuffer(<GridDocument model={model} printedAt={printedAt} />);
}

export async function renderWeekPdf(model: TimesheetModel): Promise<Buffer> {
  return renderToBuffer(<WeekDocument model={model} />);
}
