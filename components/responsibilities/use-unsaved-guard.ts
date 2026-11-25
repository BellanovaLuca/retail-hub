"use client";

import * as React from "react";

/**
 * Protegge le modifiche non salvate: avviso del browser se si chiude o si ricarica la pagina e,
 * con `confirmLinks`, una conferma prima di seguire un link interno (cambio settimana, scheda…).
 * Attivo solo finché `unsaved` è vero.
 */
export function useUnsavedGuard(unsaved: boolean, confirmLinks?: string) {
  React.useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // In cattura sul documento: arriva prima della navigazione di Next e la può fermare.
    const onClick = (e: MouseEvent) => {
      if (!confirmLinks || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Stessa pagina (ancore): niente da perdere.
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      if (!window.confirm(confirmLinks)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved, confirmLinks]);
}
