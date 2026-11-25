import type { Metadata } from "next";
import { safeReturnPath } from "@/lib/auth/return-path";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accesso" };

export default async function AccessoPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; disattivato?: string; scaduta?: string }>;
}) {
  const { da, disattivato, scaduta } = await searchParams;
  // Solo percorsi interni (lib/auth/return-path): niente "//host", "/\\host" né tab o a-capo.
  const next = safeReturnPath(typeof da === "string" ? da : undefined);

  return (
    <>
      <p className="mb-3 eyebrow">Portale staff</p>
      <h1 className="mb-10 font-display text-4xl font-light tracking-tight">Accedi</h1>
      {disattivato ? (
        <p role="alert" className="mb-6 border-l-2 border-danger pl-3 text-sm text-danger">
          Questo account è disattivato. Rivolgiti a un responsabile.
        </p>
      ) : null}
      {scaduta && !disattivato ? (
        <p role="status" className="mb-6 border-l-2 border-line-strong pl-3 text-sm text-muted">
          Sessione scaduta: per sicurezza, dopo 30 giorni si rientra con codice e PIN.
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="mt-10 text-sm text-muted">
        PIN dimenticato? Chiedi a un responsabile di generarne uno nuovo.
      </p>
    </>
  );
}
