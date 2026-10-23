import * as Encoding from "encoding-japanese";
import type { AuthoredTrack } from "@amsvs/api";
import { parseUst, parseUstText } from "./ust";
import { parseUstx } from "./ustx";

export function importScore(format: string | undefined, bytes: Uint8Array | string, filename: string): { tracks: AuthoredTrack[]; diagnostics: { severity: "warning"; code: string; message: string }[] } {
  let extension = (format ?? filename.split(".").pop() ?? "").toLowerCase().replace(/^\./, "");
  // The host passes the member ID and a synthetic import.ust filename for
  // both extensions. UST section headers distinguish it from USTX YAML/JSON.
  if (extension === "import.ust.score") {
    const text = typeof bytes === "string" ? bytes : parseUstText(bytes);
    extension = /^\s*\[#(?:VERSION|SETTING|\d+)\]/m.test(text.replace(/^\uFEFF/, "")) ? "ust" : "ustx";
  }
  if (extension === "ust") return { tracks: [parseUst(typeof bytes === "string" ? bytes : parseUstText(bytes), filename)], diagnostics: [] };
  if (extension === "ustx") return { tracks: parseUstx(typeof bytes === "string" ? bytes : Encoding.convert(bytes, { to: "UNICODE", from: "UTF8", type: "string", fallback: "error" }), filename), diagnostics: [] };
  throw new Error(`Unsupported format: ${extension || "unknown"}`);
}
