import { describe, expect, it } from "vitest";
import { ownAttachmentPaths } from "@/app/admin/richieste/attachments";

const A = "00000000-0000-0000-0000-0000000000e1";
const B = "00000000-0000-0000-0000-0000000000e2";

describe("allegati da eliminare con «Azzera richieste»", () => {
  it("tiene solo i file nella cartella di chi ha fatto la richiesta", () => {
    expect(
      ownAttachmentPaths([
        { profile_id: A, attachment_path: `${A}/1a2b3c4d-certificato.pdf` },
        { profile_id: A, attachment_path: null },
        // Percorsi scritti a mano dal dipendente: allegato di una comunicazione, file di un collega.
        { profile_id: A, attachment_path: "comunicazioni/abc/regolamento.pdf" },
        { profile_id: A, attachment_path: `${B}/1a2b3c4d-certificato.pdf` },
        { profile_id: B, attachment_path: `${B}/x.pdf` },
      ]),
    ).toEqual([`${A}/1a2b3c4d-certificato.pdf`, `${B}/x.pdf`]);
  });

  it("scarta risalite di cartella e segmenti vuoti", () => {
    expect(
      ownAttachmentPaths([
        { profile_id: A, attachment_path: `${A}/../${B}/x.pdf` },
        { profile_id: A, attachment_path: `${A}/./x.pdf` },
        { profile_id: A, attachment_path: `${A}//x.pdf` },
        { profile_id: A, attachment_path: `${A}/` },
        { profile_id: A, attachment_path: `${A}x/file.pdf` },
      ]),
    ).toEqual([]);
  });
});
