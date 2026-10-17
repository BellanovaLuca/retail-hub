import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Testo markdown reso in modo sicuro: `renderMarkdown` fa l'escape di tutto l'HTML in ingresso
 * e ammette solo link http(s), quindi l'inserimento diretto è sicuro. I titoli `##` diventano
 * h3 (il testo sta sempre sotto un titolo h2 della pagina).
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  if (!source.trim()) return null;
  return (
    <div
      className={cn(
        "max-w-prose text-[0.9375rem] leading-relaxed",
        "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3:first-child]:mt-0",
        "[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:tracking-[0.06em] [&_h4]:uppercase",
        "[&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-muted [&_strong]:font-semibold",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source, { headingLevel: 3 }) }}
    />
  );
}
