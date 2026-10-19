import * as Encoding from "encoding-japanese";
import type { AuthoredTrack } from "@amsvs/api";
import { parseUst, parseUstText } from "./ust";
import { parseUstx } from "./ustx";

export function importScore(format: string | undefined, bytes: Uint8Array | string, filename: string): { tracks: AuthoredTrack[]; diagnostics: { severity: "warning"; code: string; message: string }[] } {
  const extension = (format ?? filename.split(".").pop() ?? "").toLowerCase().replace(/^\./, "");
  if (extension === "ust") return { tracks: [parseUst(typeof bytes === "string" ? bytes : parseUstText(bytes), filename)], diagnostics: [] };
  if (extension === "ustx") return { tracks: parseUstx(typeof bytes === "string" ? bytes : Encoding.convert(bytes, { to: "UNICODE", from: "UTF8", type: "string", fallback: "error" }), filename), diagnostics: [] };
  throw new Error(`Unsupported format: ${extension || "unknown"}`);
}
