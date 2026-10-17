import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accesso" };

export default async function AccessoPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; disattivato?: string }>;
}) {
  const { da, disattivato } = await searchParams;
  // Solo percorsi interni: niente "//host" né "/\\host" (che i browser leggono come esterni).
  const next = da && /^\/(?![/\\])/.test(da) ? da : "/";

  return (
    <>
      <p className="mb-3 eyebrow">Portale staff</p>
      <h1 className="mb-10 font-display text-4xl font-light tracking-tight">Accedi</h1>
      {disattivato ? (
        <p role="alert" className="mb-6 border-l-2 border-danger pl-3 text-sm text-danger">
          Questo account è disattivato. Rivolgiti a un responsabile.
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="mt-10 text-sm text-muted">
        PIN dimenticato? Chiedi a un responsabile di generarne uno nuovo.
      </p>
    </>
  );
}
