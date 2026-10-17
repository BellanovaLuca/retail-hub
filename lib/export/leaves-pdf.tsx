import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { MONTH_NAMES, isWeekendDate, monthDates, weekdayLetter } from "@/lib/leaves/plan";
import { fitNames, namesByDate, type LeavesExportData } from "./leaves-data";

const ROW_H = 15.2;

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20,
    fontFamily: "Helvetica",
    fontSize: 6,
    color: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  title: { fontFamily: "Helvetica-Bold", fontSize: 12, letterSpacing: 0.6 },
  subtitle: { fontSize: 7, color: "#57534E" },
  months: { flexDirection: "row", gap: 8 },
  month: { flex: 1 },
  monthTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 0.8,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#0A0A0A",
    marginBottom: 1,
  },
  row: {
    flexDirection: "row",
    height: ROW_H,
    borderBottomWidth: 0.4,
    borderBottomColor: "#E7E5E4",
    alignItems: "flex-start",
    paddingTop: 1.5,
    overflow: "hidden",
  },
  shaded: { backgroundColor: "#F5F5F4" },
  day: { width: 10, textAlign: "right", color: "#57534E", marginRight: 3 },
  letter: { width: 6, color: "#A8A29E" },
  letterShaded: { color: "#0A0A0A" },
  names: { flex: 1, fontSize: 5.6, lineHeight: 1.15 },
  footer: { marginTop: 6, fontSize: 6, color: "#57534E" },
});

/** PDF della vista "Calendario annuale": A4 orizzontale, 6 mesi per pagina. */
export async function buildLeavesPdf(data: LeavesExportData): Promise<Buffer> {
  const names = namesByDate(data);
  const halves = [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
  ];
  const doc = (
    <Document title={data.title} author="Portale Staff Cordusio" language="it">
      {halves.map((months, page) => (
        <Page key={page} size="A4" orientation="landscape" style={s.page}>
          <View style={s.header}>
            <Text style={s.title}>{data.title.toUpperCase()}</Text>
            <Text style={s.subtitle}>
              {data.subtitle ? `${data.subtitle} · ` : ""}
              {page === 0 ? "Gennaio – Giugno" : "Luglio – Dicembre"}
            </Text>
          </View>
          <View style={s.months}>
            {months.map((m) => (
              <View key={m} style={s.month}>
                <Text style={s.monthTitle}>{MONTH_NAMES[m].toUpperCase()}</Text>
                {monthDates(data.year, m + 1).map((date, i) => {
                  const shaded = isWeekendDate(date) || data.holidays.has(date);
                  return (
                    <View key={date} style={shaded ? [s.row, s.shaded] : s.row}>
                      <Text style={s.day}>{i + 1}</Text>
                      <Text style={shaded ? [s.letter, s.letterShaded] : s.letter}>
                        {weekdayLetter(date)}
                      </Text>
                      <Text style={s.names}>{fitNames(names.get(date) ?? [], 62)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={s.footer}>
            ? = da confermare
            {data.audience === "admin"
              ? " · (PE) permesso, (PE4) permesso di 4 ore, (MA) malattia, (A) altra assenza"
              : " · (assente) = assenza diversa dalle ferie"}
            {" · "}in grigio weekend e festivi
          </Text>
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
