import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-8 sm:px-10">
      <Wordmark />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <p className="mb-3 eyebrow">Pagina non trovata</p>
        <h1 className="mb-6 font-display text-4xl font-light tracking-tight">
          Qui non c&apos;è niente
        </h1>
        <p className="mb-10 text-muted">
          L&apos;indirizzo è sbagliato oppure la pagina è stata tolta.
        </p>
        <Link href="/" className="link-underline eyebrow text-foreground">
          Torna alla Home
        </Link>
      </main>
    </div>
  );
}
