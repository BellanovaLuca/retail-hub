"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { deleteShiftTemplate, saveShiftTemplate } from "../actions";

type Template = {
  id: string;
  code: string;
  label: string;
  isAbsence: boolean;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  sortOrder: number;
};

const empty: Omit<Template, "id"> = {
  code: "",
  label: "",
  isAbsence: false,
  startTime: "10:00",
  endTime: "18:00",
  breakMinutes: 60,
  sortOrder: 50,
};

function netHours(t: Omit<Template, "id">) {
  if (t.isAbsence || !t.startTime || !t.endTime) return null;
  const [sh, sm] = t.startTime.split(":").map(Number);
  const [eh, em] = t.endTime.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm) - t.breakMinutes) / 60;
}

export function TemplatesEditor({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{
    id: string | null;
    values: Omit<Template, "id">;
  } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const res = await saveShiftTemplate(editing.id, editing.values);
      setResult(res);
      if (res.ok) {
        setEditing(null);
        router.refresh();
      }
    });
  }

  function remove(t: Template) {
    if (!confirm(`Eliminare il turno rapido ${t.code}? I turni già pianificati restano.`)) return;
    startTransition(async () => {
      setResult(await deleteShiftTemplate(t.id));
      router.refresh();
    });
  }

  const v = editing?.values;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <FormMessage result={editing ? null : result} />
        <Button
          onClick={() => {
            setResult(null);
            setEditing({ id: null, values: empty });
          }}
        >
          <Plus aria-hidden /> Nuovo turno rapido
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Codice</Th>
            <Th>Descrizione</Th>
            <Th>Orario</Th>
            <Th className="text-right">Pausa</Th>
            <Th className="text-right">Ore</Th>
            <Th>
              <span className="sr-only">Azioni</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => {
            const hours = netHours(t);
            return (
              <tr key={t.id}>
                <Td className="font-display text-base font-semibold">{t.code}</Td>
                <Td>{t.label}</Td>
                <Td>{t.isAbsence ? <Badge>Assenza</Badge> : `${t.startTime}–${t.endTime}`}</Td>
                <Td className="text-right">{t.isAbsence ? "—" : `${t.breakMinutes}′`}</Td>
                <Td className="text-right">
                  {hours == null ? "—" : hours.toLocaleString("it-IT")}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Modifica ${t.code}`}
                    onClick={() => {
                      setResult(null);
                      setEditing({ id: t.id, values: t });
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Elimina ${t.code}`}
                    onClick={() => remove(t)}
                    disabled={pending}
                  >
                    <Trash2 />
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && v ? (
          <DialogContent title={editing.id ? `Turno ${v.code}` : "Nuovo turno rapido"}>
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="grid grid-cols-[7rem_1fr] gap-4">
                <Field label="Codice" htmlFor="tpl-code">
                  <Input
                    id="tpl-code"
                    className="uppercase"
                    maxLength={6}
                    value={v.code}
                    onChange={(e) =>
                      setEditing({ ...editing, values: { ...v, code: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Descrizione" htmlFor="tpl-label">
                  <Input
                    id="tpl-label"
                    value={v.label}
                    onChange={(e) =>
                      setEditing({ ...editing, values: { ...v, label: e.target.value } })
                    }
                  />
                </Field>
              </div>
              <Checkbox
                label="È un'assenza (senza orario)"
                checked={v.isAbsence}
                onChange={(e) =>
                  setEditing({ ...editing, values: { ...v, isAbsence: e.target.checked } })
                }
              />
              {!v.isAbsence ? (
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Inizio" htmlFor="tpl-start">
                    <Input
                      id="tpl-start"
                      type="time"
                      className="nums"
                      value={v.startTime ?? ""}
                      onChange={(e) =>
                        setEditing({ ...editing, values: { ...v, startTime: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Fine" htmlFor="tpl-end">
                    <Input
                      id="tpl-end"
                      type="time"
                      className="nums"
                      value={v.endTime ?? ""}
                      onChange={(e) =>
                        setEditing({ ...editing, values: { ...v, endTime: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Pausa (min)" htmlFor="tpl-break">
                    <Input
                      id="tpl-break"
                      type="number"
                      min={0}
                      step={15}
                      className="nums"
                      value={v.breakMinutes}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          values: { ...v, breakMinutes: Number(e.target.value) },
                        })
                      }
                    />
                  </Field>
                </div>
              ) : null}
              <Field label="Ordine" htmlFor="tpl-order" hint="Ordine nei menu di scelta.">
                <Input
                  id="tpl-order"
                  type="number"
                  min={0}
                  className="w-28 nums"
                  value={v.sortOrder}
                  onChange={(e) =>
                    setEditing({ ...editing, values: { ...v, sortOrder: Number(e.target.value) } })
                  }
                />
              </Field>
              {netHours(v) != null ? (
                <p className="text-sm text-muted nums">
                  Ore lavorate: {netHours(v)!.toLocaleString("it-IT")}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-4">
                <FormMessage result={result} />
                <Button type="submit" disabled={pending}>
                  {pending ? "Salvataggio…" : "Salva"}
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
