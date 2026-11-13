import type { AuthoredTrack } from "@amsvs/api";
import { parseUst, parseUstText } from "./ust";
import { parseUstx } from "./ustx";
import type { ImportDiagnostic } from "../../import.common/shared";

declare const TextDecoder: new (label?: string, options?: { fatal?: boolean }) => { decode(input: Uint8Array): string };

export function importScore(format: string | undefined, bytes: Uint8Array | string, filename: string): { tracks: AuthoredTrack[]; diagnostics: ImportDiagnostic[] } {
  const diagnostics: ImportDiagnostic[] = [];
  let extension = (format ?? filename.split(".").pop() ?? "").toLowerCase().replace(/^\./, "");
  // The host passes the member ID and a synthetic import.ust filename for
  // both extensions. UST section headers distinguish it from USTX YAML/JSON.
  if (extension === "import.ust.score") {
    // Only the section header is needed for detection. Decoding an entire large
    // USTX as Japanese legacy text can exhaust the host's QuickJS memory limit.
    const text = typeof bytes === "string" ? bytes.slice(0, 4096)
      : bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0xfe && bytes[1] === 0xff
        ? parseUstText(bytes.slice(0, 4096))
        : new TextDecoder().decode(bytes.slice(0, 4096));
    extension = /^\s*\[#(?:VERSION|SETTING|\d+)\]/m.test(text.replace(/^\uFEFF/, "")) ? "ust" : "ustx";
  }
  if (extension === "ust") return { tracks: [parseUst(typeof bytes === "string" ? bytes : parseUstText(bytes), filename, diagnostics)], diagnostics };
  if (extension === "ustx") return { tracks: parseUstx(typeof bytes === "string" ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes), filename, diagnostics), diagnostics };
  throw new Error(`Unsupported format: ${extension || "unknown"}`);
}
