// pnpm seed:dev — persone inventate per lo sviluppo (MAI su produzione).
// Include tre "Francesca" per provare il nome visualizzato univoco.
import { adminClient, createPerson, loadEnv, type NewPerson } from "./lib";

loadEnv();

if (process.env.VERCEL_ENV === "production") {
  console.error("seed:dev non va eseguito in produzione.");
  process.exit(1);
}

const PIN = "482913"; // PIN provvisorio comune per i dati di prova
const ADMIN_PIN = "39182746";

const people: Omit<NewPerson, "pin" | "mustChangePin">[] = [
  {
    code: "DEV-001",
    firstName: "Marta",
    lastName: "Galli",
    displayName: "Marta",
    role: "admin",
    departments: ["Management", "Ottici"],
    weeklyHours: 40,
    homeZone: "vista",
    countsForCoverage: false,
  },
  {
    code: "DEV-002",
    firstName: "Davide",
    lastName: "Conti",
    displayName: "Davide",
    role: "admin",
    departments: ["Management", "Addetti vendita"],
    weeklyHours: 40,
    homeZone: "sole",
  },
  {
    code: "DEV-003",
    firstName: "Francesca",
    lastName: "Dellera",
    displayName: "Francesca",
    shortLabel: "FRA D.",
    role: "employee",
    departments: ["Ottici"],
    weeklyHours: 40,
    homeZone: "vista",
  },
  {
    code: "DEV-004",
    firstName: "Francesca",
    lastName: "Rinaldi",
    displayName: "Fra R.",
    shortLabel: "FRA R",
    role: "employee",
    departments: ["Addetti vendita"],
    weeklyHours: 32,
    homeZone: "sole",
  },
  {
    code: "DEV-005",
    firstName: "Francesca",
    lastName: "Moretti",
    displayName: "Francy",
    shortLabel: "FRANCY",
    role: "employee",
    departments: ["Addetti vendita"],
    weeklyHours: 24,
    homeZone: "jolly",
  },
  {
    code: "DEV-006",
    firstName: "Luca",
    lastName: "Ferri",
    displayName: "Luca",
    role: "employee",
    departments: ["Ottici"],
    weeklyHours: 40,
    homeZone: "vista",
  },
  {
    code: "DEV-007",
    firstName: "Giulia",
    lastName: "Sartori",
    displayName: "Giulia",
    role: "employee",
    departments: ["Addetti vendita"],
    weeklyHours: 40,
    homeZone: "sole",
  },
  {
    code: "DEV-008",
    firstName: "Paolo",
    lastName: "Bassi",
    displayName: "Paolo",
    role: "employee",
    departments: ["Addetti vendita"],
    weeklyHours: 30,
    homeZone: "vista",
  },
];

const db = adminClient();
for (const [i, person] of people.entries()) {
  const isAdmin = person.role === "admin";
  const { created } = await createPerson(db, {
    ...person,
    pin: isAdmin ? ADMIN_PIN : PIN,
    mustChangePin: true,
    sortOrder: i + 1,
  });
  console.log(`${created ? "creato " : "esiste "} ${person.code}  ${person.displayName}`);
}

console.log(
  `\nPIN provvisori: dipendenti ${PIN}, admin ${ADMIN_PIN} (cambio obbligatorio al primo accesso).`,
);
