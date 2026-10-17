"use client";

import { BellRing, Share, SquarePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { changePin } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const STEPS = ["Nuovo PIN", "Schermata Home", "Notifiche"] as const;

export function Onboarding({
  displayName,
  pinHint,
  startAtStep,
}: {
  displayName: string;
  pinHint: string;
  startAtStep: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(startAtStep);

  function finish() {
    router.replace("/");
    router.refresh();
  }

  return (
    <div>
      <ol className="mb-10 flex gap-2" aria-label="Passaggi">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "h-0.5 flex-1 transition-colors duration-200",
              i <= step ? "bg-foreground" : "bg-line",
            )}
          >
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>
      <p className="mb-3 eyebrow">
        Passo {step + 1} di {STEPS.length}
      </p>
      {step === 0 ? (
        <PinStep displayName={displayName} pinHint={pinHint} onDone={() => setStep(1)} />
      ) : step === 1 ? (
        <HomeScreenStep onNext={() => setStep(2)} />
      ) : (
        <NotificationsStep onDone={finish} />
      )}
    </div>
  );
}

function PinStep({
  displayName,
  pinHint,
  onDone,
}: {
  displayName: string;
  pinHint: string;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await changePin({ pin, confirm, acceptPrivacy: accept });
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="font-display text-3xl font-light tracking-tight">Ciao {displayName}</h1>
        <p className="mt-3 text-muted">
          Scegli il tuo PIN personale: {pinHint}, niente sequenze, cifre ripetute o date.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pin">Nuovo PIN</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="tracking-[0.3em] nums"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Ripeti il PIN</Label>
        <Input
          id="confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="tracking-[0.3em] nums"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-foreground"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
        />
        <span>
          Ho letto e accetto l&apos;{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4">
            informativa privacy
          </Link>
          .
        </span>
      </label>
      <FieldError>{error}</FieldError>
      <Button type="submit" size="lg" disabled={pending || !pin || !confirm}>
        {pending ? "Salvataggio…" : "Salva e continua"}
      </Button>
    </form>
  );
}

function HomeScreenStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-light tracking-tight">Aggiungi l&apos;app</h1>
      <p className="text-muted">
        Mettila nella schermata Home del telefono: si apre come un&apos;app, a tutto schermo.
      </p>
      <ul className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3 border-t border-line pt-4">
          <Share className="mt-0.5 size-5 shrink-0 stroke-[1.5]" aria-hidden />
          <span>
            <strong className="font-medium">iPhone (Safari)</strong>: tocca Condividi, poi
            &laquo;Aggiungi alla schermata Home&raquo;.
          </span>
        </li>
        <li className="flex gap-3 border-t border-line pt-4">
          <SquarePlus className="mt-0.5 size-5 shrink-0 stroke-[1.5]" aria-hidden />
          <span>
            <strong className="font-medium">Android (Chrome)</strong>: tocca il menu ⋮, poi
            &laquo;Installa app&raquo; o &laquo;Aggiungi a schermata Home&raquo;.
          </span>
        </li>
      </ul>
      <Button size="lg" onClick={onNext}>
        Avanti
      </Button>
    </div>
  );
}

function NotificationsStep({ onDone }: { onDone: () => void }) {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [state, setState] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported",
  );

  async function enable() {
    if (!supported) return;
    setState(await Notification.requestPermission());
    // La registrazione push (VAPID) arriva con la milestone Notifiche.
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-light tracking-tight">Attiva le notifiche</h1>
      <p className="text-muted">
        Ti avvisiamo quando escono gli orari, quando una richiesta viene approvata e quando c&apos;è
        una comunicazione per te.
      </p>
      {state === "granted" ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <BellRing className="size-4 stroke-[1.5]" aria-hidden /> Notifiche attive.
        </p>
      ) : state === "denied" ? (
        <p className="text-sm text-muted">
          Le notifiche sono bloccate: puoi attivarle dalle impostazioni del browser.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-muted">
          Su questo browser le notifiche non sono disponibili. Su iPhone funzionano dopo aver
          aggiunto l&apos;app alla schermata Home.
        </p>
      ) : (
        <Button size="lg" variant="secondary" onClick={enable}>
          <BellRing aria-hidden /> Attiva le notifiche
        </Button>
      )}
      <Button size="lg" onClick={onDone}>
        Inizia
      </Button>
    </div>
  );
}
