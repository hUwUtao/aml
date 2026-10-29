import { plugin } from "@amsvs/api";
import type { DynamicImportContext, PluginDef } from "@amsvs/api";
import { parseSvp } from "./parser";
import * as Encoding from "encoding-japanese";
import type { ImportDiagnostic } from "../../import.common/shared";

function readPayload(ctx: DynamicImportContext): { bytes: Uint8Array | string; filename: string } {
  const file = ctx.file;
  if (file) return { bytes: file.readBytes(), filename: file.name };
  if (ctx.content !== undefined) return { bytes: ctx.content, filename: ctx.filename ?? "import.svp" };
  throw new Error("Importer received no file content");
}

const importer = {
  id: ".score",
  name: "Synthesizer V Studio score",
  role: "importer",
  extensions: ["svp"],
  onImport(ctx: DynamicImportContext) {
    const payload = readPayload(ctx);
    const text = typeof payload.bytes === "string" ? payload.bytes : Encoding.convert(payload.bytes, { to: "UNICODE", from: "UTF8", type: "string", fallback: "error" });
    const diagnostics: ImportDiagnostic[] = [];
    return { tracks: parseSvp(text, payload.filename, diagnostics), diagnostics };
  },
} as unknown as PluginDef;

plugin("import.svp").version("0.1.0").name("Synthesizer V score importer").member(importer).register();
