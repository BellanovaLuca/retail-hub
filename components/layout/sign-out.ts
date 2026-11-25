"use client";

import { signOut, signOutEverywhere } from "@/lib/auth/actions";
import { leaveDevice } from "./offline-copy";

/** Azione dei form «Esci»: prima stacca il dispositivo (copia offline, push), poi chiude la sessione. */
export async function signOutThisDevice() {
  const endpoint = await leaveDevice();
  await signOut(endpoint);
}

/** «Esci da tutti i dispositivi»: il server elimina tutte le sottoscrizioni push della persona. */
export async function signOutAllDevices() {
  await leaveDevice();
  await signOutEverywhere();
}
