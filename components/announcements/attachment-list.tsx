import { FileText } from "lucide-react";
import { formatBytes } from "@/lib/announcements/model";
import type { SignedAttachment } from "@/lib/announcements/storage";

/** Allegati con link firmati; se lo Storage non risponde restano elencati come non disponibili. */
export function AttachmentList({ items }: { items: SignedAttachment[] }) {
  if (items.length === 0) return null;
  const unavailable = items.some((a) => !a.url);
  return (
    <div className="mt-8">
      <p className="mb-3 eyebrow">Allegati</p>
      <ul className="flex flex-col border-t border-line">
        {items.map((a) => (
          <li key={a.path} className="border-b border-line">
            {a.url ? (
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-3 py-2 text-sm hover:bg-surface"
              >
                <FileText className="size-4 shrink-0 stroke-[1.5]" aria-hidden />
                <span className="flex-1 underline-offset-4 hover:underline">{a.name}</span>
                <span className="text-xs text-muted nums">{formatBytes(a.size)}</span>
              </a>
            ) : (
              <span className="flex min-h-11 items-center gap-3 py-2 text-sm text-muted">
                <FileText className="size-4 shrink-0 stroke-[1.5]" aria-hidden />
                <span className="flex-1">{a.name}</span>
                <span className="text-xs">non disponibile</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {unavailable ? (
        <p className="mt-2 text-xs text-muted">
          L&apos;archivio degli allegati non risponde in questo momento: riprova più tardi.
        </p>
      ) : null}
    </div>
  );
}
