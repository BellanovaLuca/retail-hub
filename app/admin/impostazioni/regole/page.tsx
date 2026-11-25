import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getDepartments } from "@/lib/data/people";
import { getVariables, toRuleRecord } from "@/lib/data/rules";
import { createClient } from "@/lib/supabase/server";
import { InstallStandardRules } from "./install-standard";
import { RulesManager } from "./rules-manager";

export const metadata: Metadata = { title: "Regole di pianificazione" };

export default async function RegolePage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  await requireAdmin();
  const { set } = await searchParams;
  const supabase = await createClient();

  const [{ data: sets }, variables, departments] = await Promise.all([
    supabase
      .from("planning_rule_sets")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name"),
    getVariables(supabase),
    getDepartments(supabase),
  ]);
  // Nessun set ancora: il set "Standard" si crea con un'azione (una scrittura non va fatta
  // mentre si carica la pagina), avviata da sola dal componente qui sotto.
  if (sets && sets.length === 0) return <InstallStandardRules />;
  const current = sets?.find((s) => s.id === set) ?? sets?.find((s) => s.is_default) ?? sets?.[0];
  const { data: rules } = current
    ? await supabase
        .from("planning_rules")
        .select("*")
        .eq("rule_set_id", current.id)
        .order("sort_order")
    : { data: [] };

  return (
    <RulesManager
      sets={(sets ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isDefault: s.is_default,
      }))}
      currentSetId={current?.id ?? null}
      rules={(rules ?? []).map(toRuleRecord)}
      variables={variables.map((v) => ({
        id: v.id,
        key: v.key,
        label: v.label,
        value: Number(v.value),
        unit: v.unit ?? "",
        description: v.description ?? "",
      }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
