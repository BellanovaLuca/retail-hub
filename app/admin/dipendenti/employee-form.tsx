"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, Select, Switch, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  employeeSchema,
  PERSON_COLORS,
  type EmployeeInput,
  type EmployeeValues,
} from "@/lib/validators/employee";
import { createEmployee, updateEmployee, type Credentials } from "./actions";
import { CredentialsDialog } from "./credentials-dialog";

export function EmployeeForm({
  employeeId,
  defaults,
  departments,
}: {
  employeeId?: string;
  defaults: EmployeeInput;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [credentials, setCredentials] = useState<(Credentials & { id: string }) | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<EmployeeInput, unknown, EmployeeValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: defaults,
  });
  const selectedDepartments = useWatch({ control, name: "departmentIds" }) ?? [];
  const primary = useWatch({ control, name: "primaryDepartmentId" });

  function toggleDepartment(id: string, checked: boolean) {
    const next = checked
      ? [...selectedDepartments, id]
      : selectedDepartments.filter((d) => d !== id);
    setValue("departmentIds", next, { shouldValidate: true });
    if (checked && !primary) setValue("primaryDepartmentId", id);
    if (!checked && primary === id) setValue("primaryDepartmentId", next[0] ?? "");
  }

  function onSubmit(values: EmployeeValues) {
    setResult(null);
    startTransition(async () => {
      const res = employeeId
        ? await updateEmployee(employeeId, values)
        : await createEmployee(values);
      if (!res.ok) {
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) {
          setError(field as keyof EmployeeInput, { message });
        }
        setResult({ ok: false, message: res.message });
        return;
      }
      if (!employeeId && res.data) {
        setCredentials(res.data);
        return;
      }
      setResult({ ok: true, message: res.message });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Anagrafica</CardTitle>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome" htmlFor="firstName" error={errors.firstName?.message}>
            <Input
              id="firstName"
              autoComplete="off"
              {...register("firstName")}
              aria-invalid={!!errors.firstName}
            />
          </Field>
          <Field label="Cognome" htmlFor="lastName" error={errors.lastName?.message}>
            <Input
              id="lastName"
              autoComplete="off"
              {...register("lastName")}
              aria-invalid={!!errors.lastName}
            />
          </Field>
          <Field
            label="Nome visualizzato"
            htmlFor="displayName"
            error={errors.displayName?.message}
            hint="Univoco: è come la persona compare ovunque (es. Francesca, Francy, Fra R.)."
          >
            <Input
              id="displayName"
              autoComplete="off"
              {...register("displayName")}
              aria-invalid={!!errors.displayName}
            />
          </Field>
          <Field
            label="Sigla in colonna"
            htmlFor="shortLabel"
            error={errors.shortLabel?.message}
            hint="Intestazione corta nel foglio orario (es. FRA D.)."
          >
            <Input
              id="shortLabel"
              autoComplete="off"
              className="uppercase"
              {...register("shortLabel")}
            />
          </Field>
          <Field
            label="Codice dipendente"
            htmlFor="employeeCode"
            error={errors.employeeCode?.message}
            hint="Serve per l'accesso."
          >
            <Input
              id="employeeCode"
              className="uppercase nums"
              autoComplete="off"
              {...register("employeeCode")}
              aria-invalid={!!errors.employeeCode}
            />
          </Field>
          <Field label="Ruolo" htmlFor="role">
            <Select id="role" {...register("role")}>
              <option value="employee">Dipendente</option>
              <option value="admin">Amministratore (accesso a tutto)</option>
            </Select>
          </Field>
          <Field label="Email (facoltativa)" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="off" {...register("email")} />
          </Field>
          <Field label="Telefono (facoltativo)" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" autoComplete="off" {...register("phone")} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Lavoro</CardTitle>
        <fieldset className="mb-6">
          <legend className="mb-2 eyebrow">Reparti</legend>
          <div className="divide-y divide-line border-y border-line">
            {departments.map((d) => {
              const checked = selectedDepartments.includes(d.id);
              return (
                <div key={d.id} className="flex min-h-12 items-center justify-between gap-3">
                  <label className="flex flex-1 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-foreground"
                      checked={checked}
                      onChange={(e) => toggleDepartment(d.id, e.target.checked)}
                    />
                    {d.name}
                  </label>
                  {checked ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                      <input
                        type="radio"
                        className="size-3.5 accent-foreground"
                        value={d.id}
                        {...register("primaryDepartmentId")}
                      />
                      Principale
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Il reparto principale decide il gruppo in griglia. I manager vanno messi anche in Ottici
            o Addetti vendita: contano nella copertura.
          </p>
          {errors.departmentIds?.message || errors.primaryDepartmentId?.message ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errors.departmentIds?.message ?? errors.primaryDepartmentId?.message}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Ore settimanali" htmlFor="weeklyHours" error={errors.weeklyHours?.message}>
            <Input
              id="weeklyHours"
              inputMode="decimal"
              className="nums"
              {...register("weeklyHours", {
                setValueAs: (v: string | number | null) =>
                  v === "" || v == null ? null : Number(String(v).replace(",", ".")),
              })}
              aria-invalid={!!errors.weeklyHours}
            />
          </Field>
          <Field
            label="Area di base"
            htmlFor="homeZone"
            hint="I jolly scelgono l'area turno per turno."
          >
            <Select id="homeZone" {...register("homeZone")}>
              <option value="vista">Vista</option>
              <option value="sole">Sole</option>
              <option value="jolly">Jolly</option>
            </Select>
          </Field>
        </div>

        <Controller
          control={control}
          name="countsForCoverage"
          render={({ field }) => (
            <div className="mt-4 border-t border-line pt-2">
              <Switch
                id="switch-1"
                checked={!field.value}
                onCheckedChange={(v) => field.onChange(!v)}
                label="Di solito in back office"
                description="Le sue ore non contano nella forza vendita, salvo diversa indicazione sul turno."
              />
            </div>
          )}
        />

        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <fieldset className="mt-4 border-t border-line pt-4">
              <legend className="mb-3 eyebrow">Colore personale</legend>
              <div className="flex flex-wrap gap-2">
                {PERSON_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => field.onChange(c)}
                    aria-label={`Colore ${c}`}
                    aria-pressed={field.value === c}
                    className={cn(
                      "grid size-9 place-items-center rounded-full border border-transparent",
                      field.value === c && "border-foreground",
                    )}
                  >
                    <span className="size-5 rounded-full" style={{ backgroundColor: c }} />
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        />
      </Card>

      <Card className="lg:col-span-2">
        <CardTitle>Note riservate</CardTitle>
        <Textarea
          aria-label="Note riservate"
          placeholder="Visibili solo agli amministratori."
          {...register("adminNotes")}
        />
      </Card>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end lg:col-span-2">
        <FormMessage result={result} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Salvataggio…" : employeeId ? "Salva modifiche" : "Crea dipendente"}
        </Button>
      </div>

      <CredentialsDialog
        credentials={credentials}
        onClose={() => {
          const id = credentials?.id;
          setCredentials(null);
          router.push(id ? `/admin/dipendenti/${id}` : "/admin/dipendenti");
        }}
      />
    </form>
  );
}
