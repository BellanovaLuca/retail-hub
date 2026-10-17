/** Generazione iCalendar (RFC 5545) con orari locali Europe/Rome. */

export type IcsEvent = {
  uid: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  summary: string;
  description?: string;
  stamp: string; // ISO
};

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Spezza le righe a 75 ottetti come richiesto dallo standard. */
export function foldLine(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += len;
  }
  out.push(current);
  return out.join("\r\n ");
}

const local = (date: string, time: string) =>
  `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
const utcStamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function buildIcs(opts: { calendarName: string; location: string; events: IcsEvent[] }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Staff Cordusio//Turni//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    "X-WR-TIMEZONE:Europe/Rome",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...VTIMEZONE,
  ];
  for (const e of opts.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(e.stamp)}`,
      `DTSTART;TZID=Europe/Rome:${local(e.date, e.start)}`,
      `DTEND;TZID=Europe/Rome:${local(e.date, e.end === "24:00" ? "23:59" : e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `LOCATION:${escapeText(opts.location)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
