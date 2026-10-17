"use client";

import { FileText, Paperclip, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { formatBytes, storageFileName, type Attachment } from "@/lib/announcements/model";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024; // limite del bucket `attachments`

/**
 * Allegati caricati direttamente nel bucket privato `attachments` (scrittura riservata agli
 * admin dalle policy dello Storage). Se lo Storage non risponde, lo dice chiaramente e il resto
 * del modulo si può salvare lo stesso.
 */
export function AttachmentsField({
  value,
  onChange,
  folder,
  disabled,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Cartella nel bucket, es. `announcements/<id>`. */
  folder: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const supabase = createClient();
    const added: Attachment[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          setError(`«${file.name}» supera i 10 MB.`);
          continue;
        }
        const path = `${folder}/${crypto.randomUUID().slice(0, 8)}-${storageFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (uploadError) {
          setError(
            "Lo spazio per gli allegati non risponde: puoi salvare senza allegati e aggiungerli più tardi.",
          );
          break;
        }
        added.push({ path, name: file.name, size: file.size, type: file.type || undefined });
      }
    } catch {
      setError(
        "Lo spazio per gli allegati non risponde: puoi salvare senza allegati e aggiungerli più tardi.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (added.length > 0) onChange([...value, ...added]);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ul className="border-t border-line">
          {value.map((a) => (
            <li
              key={a.path}
              className="flex min-h-11 items-center gap-3 border-b border-line text-sm"
            >
              <FileText className="size-4 shrink-0 stroke-[1.5] text-muted" aria-hidden />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-xs text-muted nums">{formatBytes(a.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.path !== a.path))}
                className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface hover:text-foreground"
                aria-label={`Rimuovi ${a.name}`}
              >
                <X className="size-4 stroke-[1.5]" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <label
          htmlFor={inputId}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-foreground px-3 text-sm font-medium hover:bg-surface has-[:disabled]:opacity-40"
        >
          <Paperclip className="size-4 stroke-[1.5]" aria-hidden />
          {uploading ? "Caricamento…" : "Aggiungi allegati"}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        <p className="mt-2 text-xs text-muted">PDF, immagini o documenti, fino a 10 MB ciascuno.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
