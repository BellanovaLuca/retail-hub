// pnpm seed:admin — crea il primo amministratore da FIRST_ADMIN_CODE / FIRST_ADMIN_PIN.
import { normalizeEmployeeCode, validateNewPin } from "../lib/auth/pin";
import { adminClient, createPerson, loadEnv } from "./lib";

loadEnv();

const code = normalizeEmployeeCode(process.env.FIRST_ADMIN_CODE ?? "");
const pin = process.env.FIRST_ADMIN_PIN ?? "";

if (!code) {
  console.error("Imposta FIRST_ADMIN_CODE (es. ADM-001).");
  process.exit(1);
}
const pinError = validateNewPin(pin, "admin");
if (pinError) {
  console.error(`FIRST_ADMIN_PIN non valido: ${pinError}`);
  process.exit(1);
}

const result = await createPerson(adminClient(), {
  code,
  pin,
  firstName: process.env.FIRST_ADMIN_FIRST_NAME ?? "Amministratore",
  lastName: process.env.FIRST_ADMIN_LAST_NAME ?? "Portale",
  displayName: process.env.FIRST_ADMIN_DISPLAY_NAME ?? "Admin",
  role: "admin",
  departments: ["Management"],
  // Il PIN l'ha scelto chi configura: niente cambio obbligatorio, ma l'informativa va accettata.
  mustChangePin: false,
});

console.log(
  result.created
    ? `Amministratore ${code} creato. Accedi con il codice e il PIN impostati, poi completa il profilo.`
    : `Esiste già un profilo con codice ${code}: nessuna modifica.`,
);
