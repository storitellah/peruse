// Non-destructive metadata writing via XMP sidecars.
//
// Peruse never rewrites the bytes of the original photo. Instead, user-authored
// metadata (caption, people, tags, verified location, rating) is serialised to
// a standards-compliant XMP packet and written to a `<name>.xmp` sidecar
// alongside the original — the same convention Lightroom, Bridge, and digiKam
// use. Sidecars are the safest possible write: the pixel data is untouched and
// the edit is trivially reversible (delete the sidecar).
//
// With the File System Access API we write the sidecar in place. In fallback
// mode we hand the user a download of the same file.

import type { Photo } from "../../types";
import { baseName } from "../util/misc";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rdfBag(items: string[]): string {
  if (!items.length) return "";
  const li = items.map((i) => `        <rdf:li>${esc(i)}</rdf:li>`).join("\n");
  return `\n      <rdf:Bag>\n${li}\n      </rdf:Bag>\n    `;
}

/** Build an XMP packet for the user-authored metadata of a photo. */
export function buildXmp(photo: Photo): string {
  const { iptc, exif } = photo;
  const keywords = rdfBag([...iptc.tags, ...photo.aiTags.map((t) => t.label)]);
  const people = rdfBag(iptc.people);
  const caption = iptc.caption
    ? `\n      <rdf:Alt>\n        <rdf:li xml:lang="x-default">${esc(iptc.caption)}</rdf:li>\n      </rdf:Alt>\n    `
    : "";
  const location = iptc.location || exif.place?.city;

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Peruse 0.1">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/">
${caption ? `   <dc:description>${caption}</dc:description>\n` : ""}${keywords ? `   <dc:subject>${keywords}</dc:subject>\n` : ""}${people ? `   <Iptc4xmpExt:PersonInImage>${people}</Iptc4xmpExt:PersonInImage>\n` : ""}${location ? `   <Iptc4xmpExt:LocationShown><rdf:Bag><rdf:li rdf:parseType="Resource"><Iptc4xmpExt:City>${esc(location)}</Iptc4xmpExt:City>${exif.place?.region ? `<Iptc4xmpExt:ProvinceState>${esc(exif.place.region)}</Iptc4xmpExt:ProvinceState>` : ""}${exif.place?.country ? `<Iptc4xmpExt:CountryName>${esc(exif.place.country)}</Iptc4xmpExt:CountryName>` : ""}</rdf:li></rdf:Bag></Iptc4xmpExt:LocationShown>\n` : ""}${typeof iptc.rating === "number" ? `   <xmp:Rating>${iptc.rating}</xmp:Rating>\n` : ""}   <xmp:MetadataDate>${new Date().toISOString()}</xmp:MetadataDate>
   <xmp:CreatorTool>Peruse</xmp:CreatorTool>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export interface WriteResult {
  wrote: "inplace" | "download";
  fileName: string;
}

/** Persist the sidecar next to the original, or download it in fallback mode. */
export async function writeSidecar(photo: Photo): Promise<WriteResult> {
  const xmp = buildXmp(photo);
  const fileName = `${baseName(photo.name)}.xmp`;

  if (photo.dirHandle) {
    const perm = await ensureWritable(photo.dirHandle);
    if (perm) {
      const handle = await photo.dirHandle.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(xmp);
      await writable.close();
      return { wrote: "inplace", fileName };
    }
  }

  // Fallback: trigger a download so the user can drop it beside the original.
  const blob = new Blob([xmp], { type: "application/rdf+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { wrote: "download", fileName };
}

async function ensureWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    if (!dir.queryPermission) return true;
    let state = await dir.queryPermission({ mode: "readwrite" });
    if (state === "granted") return true;
    if (dir.requestPermission) {
      state = await dir.requestPermission({ mode: "readwrite" });
    }
    return state === "granted";
  } catch {
    return false;
  }
}
