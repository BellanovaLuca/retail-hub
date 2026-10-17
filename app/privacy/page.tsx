import type { Metadata } from "next";
import { Wordmark } from "@/components/layout/wordmark";

export const metadata: Metadata = { title: "Informativa privacy" };

// Testo di base da far rivedere al titolare del trattamento prima della messa in produzione.
export default function PrivacyPage() {
  return (
    <div className="px-6 py-8 sm:px-10">
      <Wordmark />
      <article className="mx-auto mt-14 flex max-w-2xl flex-col gap-6 leading-relaxed">
        <p className="eyebrow">Informativa</p>
        <h1 className="font-display text-4xl font-light tracking-tight">Privacy</h1>
        <p className="text-muted">
          Questo portale è riservato al personale del negozio Salmoiraghi &amp; Viganò di Piazza
          Cordusio e serve a organizzare turni, ferie, richieste, obiettivi e comunicazioni interne.
        </p>
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Quali dati</h2>
          <p>
            Nome, cognome, nome visualizzato, codice dipendente, reparti, ore contrattuali, turni,
            ferie e assenze, richieste, obiettivi e relativi commenti. Facoltativi: email, telefono
            e foto, che inserisci tu dal profilo.
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Chi li vede</h2>
          <p>
            I colleghi vedono solo il tuo nome visualizzato, i turni pubblicati e se sei in ferie o
            assente, mai il motivo di un permesso o di una malattia. Performance, richieste, dati di
            contratto e note restano visibili solo a te e ai responsabili.
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Malattia</h2>
          <p>
            Per la malattia si registrano solo il tipo di assenza e le date, mai la diagnosi.
            Eventuali allegati li vedono solo i responsabili.
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Sicurezza</h2>
          <p>
            Il PIN non viene mai salvato in chiaro. Dopo 5 tentativi errati l&apos;accesso si blocca
            per 15 minuti. I dati sono conservati su server nell&apos;Unione Europea con backup
            giornalieri.
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">I tuoi diritti</h2>
          <p>
            Puoi chiedere in ogni momento di consultare, correggere o cancellare i tuoi dati
            rivolgendoti alla direzione del negozio.
          </p>
        </section>
      </article>
    </div>
  );
}
