import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pinRequirement } from "@/lib/auth/pin";
import { getCurrentProfile } from "@/lib/auth/session";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Primo accesso" };

export default async function PrimoAccessoPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/accesso");
  if (!profile.active) redirect("/esci");

  const needsPin = profile.must_change_pin || !profile.privacy_accepted_at;

  return (
    <Onboarding
      displayName={profile.display_name}
      pinHint={pinRequirement(profile.role)}
      startAtStep={needsPin ? 0 : 1}
    />
  );
}
