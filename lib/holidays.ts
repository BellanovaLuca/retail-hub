/** Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher). Restituisce [mese 1-12, giorno]. */
export function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Festività nazionali italiane + Sant'Ambrogio (patrono di Milano). */
export function italianHolidays(year: number): { date: string; label: string }[] {
  const [em, ed] = easter(year);
  const easterMonday = new Date(Date.UTC(year, em - 1, ed + 1));
  return [
    { date: iso(year, 1, 1), label: "Capodanno" },
    { date: iso(year, 1, 6), label: "Epifania" },
    { date: iso(year, em, ed), label: "Pasqua" },
    {
      date: iso(year, easterMonday.getUTCMonth() + 1, easterMonday.getUTCDate()),
      label: "Lunedì dell'Angelo",
    },
    { date: iso(year, 4, 25), label: "Festa della Liberazione" },
    { date: iso(year, 5, 1), label: "Festa dei Lavoratori" },
    { date: iso(year, 6, 2), label: "Festa della Repubblica" },
    { date: iso(year, 8, 15), label: "Ferragosto" },
    { date: iso(year, 11, 1), label: "Ognissanti" },
    { date: iso(year, 12, 7), label: "Sant'Ambrogio" },
    { date: iso(year, 12, 8), label: "Immacolata Concezione" },
    { date: iso(year, 12, 25), label: "Natale" },
    { date: iso(year, 12, 26), label: "Santo Stefano" },
  ].sort((a, b) => a.date.localeCompare(b.date));
}
