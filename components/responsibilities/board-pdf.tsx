import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Board } from "@/lib/data/responsibilities";
import { cellState, isScheduledOn } from "@/lib/responsibilities/assignment";
import { dayHeader } from "./format";

const BLACK = "#0A0A0A";
const LINE = "#A8A29E";
const GREY = "#E7E5E4";
const MUTED = "#57534E";
const MISSED = "#F6E3E1";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: BLACK },
  eyebrow: { fontSize: 7, letterSpacing: 1.2, color: MUTED, textTransform: "uppercase" },
  title: { fontSize: 18, marginTop: 4, marginBottom: 14, fontFamily: "Helvetica" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, minHeight: 26 },
  head: { borderBottomWidth: 1, borderBottomColor: BLACK, minHeight: 20 },
  cTitle: { width: "26%", paddingVertical: 4, paddingRight: 6, justifyContent: "center" },
  cOwner: { width: "13%", paddingVertical: 4, paddingRight: 6, justifyContent: "center" },
  cSupport: { width: "17%", paddingVertical: 4, paddingRight: 6, justifyContent: "center" },
  cDay: { width: "6.2857%", alignItems: "center", justifyContent: "center", paddingVertical: 3 },
  headText: { fontSize: 7, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase" },
  box: { width: 18, height: 16, borderWidth: 0.8, borderColor: BLACK, borderRadius: 1 },
  boxDone: { backgroundColor: BLACK },
  boxOff: { borderColor: GREY, backgroundColor: GREY },
  boxMissed: { borderColor: "#B42318", backgroundColor: MISSED },
  who: { fontSize: 6, color: MUTED, marginTop: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
  },
});

const initials = (name: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

/** Tabellone delle responsabilità da stampare (A4 orizzontale), come il foglio Excel. */
export function BoardPdf({
  board,
  title,
  storeName,
}: {
  board: Board;
  title: string;
  storeName: string;
}) {
  return (
    <Document title={title} author={storeName}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.eyebrow}>{storeName}</Text>
        <Text style={s.title}>{title}</Text>

        <View style={[s.row, s.head]} fixed>
          <View style={s.cTitle}>
            <Text style={s.headText}>Attività</Text>
          </View>
          <View style={s.cOwner}>
            <Text style={s.headText}>Responsabile</Text>
          </View>
          <View style={s.cSupport}>
            <Text style={s.headText}>Supporto</Text>
          </View>
          {board.days.map((d) => (
            <View key={d} style={s.cDay}>
              <Text style={s.headText}>{dayHeader(d)}</Text>
            </View>
          ))}
        </View>

        {board.items.map((r) => (
          <View key={r.id} style={s.row} wrap={false}>
            <View style={s.cTitle}>
              <Text>{r.title}</Text>
            </View>
            <View style={s.cOwner}>
              <Text style={s.bold}>{r.allStaff ? "TUTTI" : (r.owner?.name ?? "—")}</Text>
            </View>
            <View style={s.cSupport}>
              <Text>{r.supports.map((p) => p.name).join(", ")}</Text>
            </View>
            {board.days.map((d) => {
              const check = board.checks[r.id]?.[d];
              const state = cellState({
                scheduled: isScheduledOn(r.scheduleDays, d),
                checked: !!check,
                date: d,
                today: board.today,
              });
              return (
                <View key={d} style={s.cDay}>
                  <View
                    style={[
                      s.box,
                      ...(state === "done" ? [s.boxDone] : []),
                      ...(state === "off" ? [s.boxOff] : []),
                      ...(state === "missed" ? [s.boxMissed] : []),
                    ]}
                  />
                  {check ? <Text style={s.who}>{initials(check.doneByName)}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>
            Compilare la casella quando si è svolta l&apos;attività · grigio = giorno non previsto
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
