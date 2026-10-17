"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { deletePushSubscription, savePushSubscription } from "@/lib/notifications/actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

/** Attiva/disattiva le notifiche push su questo dispositivo. */
export function PushToggle({
  vapidPublicKey,
  compact = false,
}: {
  vapidPublicKey: string | null;
  compact?: boolean;
}) {
  const [state, setState] = useState<State>("loading");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (!vapidPublicKey) {
        setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await registerServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  function enable() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = (await registerServiceWorker())!;
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
        });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const res = await savePushSubscription(json, navigator.userAgent);
        setResult(res);
        setState(res.ok ? "on" : "off");
      } catch {
        setResult({
          ok: false,
          message: "Non è stato possibile attivare le notifiche su questo browser.",
        });
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setResult({ ok: true, message: "Notifiche disattivate su questo dispositivo." });
    });
  }

  if (state === "loading") return <p className="text-sm text-muted">Verifica delle notifiche…</p>;
  if (state === "unsupported")
    return (
      <p className="text-sm text-muted">
        Su questo browser le notifiche push non sono disponibili. Su iPhone funzionano dopo aver
        aggiunto l&apos;app alla schermata Home.
      </p>
    );
  if (state === "unconfigured")
    return (
      <p className="text-sm text-muted">
        Le notifiche push non sono ancora configurate sul server.
      </p>
    );
  if (state === "denied")
    return (
      <p className="text-sm text-muted">
        Le notifiche sono bloccate: attivale dalle impostazioni del browser per questo sito.
      </p>
    );

  return (
    <div className="flex flex-col gap-2">
      {state === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-success">
            <BellRing className="size-4 stroke-[1.5]" aria-hidden /> Attive su questo dispositivo
          </span>
          {!compact ? (
            <Button variant="ghost" size="sm" onClick={disable} disabled={pending}>
              <BellOff aria-hidden /> Disattiva
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          variant="secondary"
          size={compact ? "lg" : "md"}
          onClick={enable}
          disabled={pending}
        >
          <BellRing aria-hidden /> Attiva le notifiche
        </Button>
      )}
      <FormMessage result={result} />
    </div>
  );
}
