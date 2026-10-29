import { plugin } from "@amsvs/api";
import type { DynamicImportContext, PluginDef } from "@amsvs/api";
import { parseCevio } from "./parser";
import * as Encoding from "encoding-japanese";
import type { ImportDiagnostic } from "../../import.common/shared";

function readPayload(ctx: DynamicImportContext): { bytes: Uint8Array | string; filename: string; format?: string } {
  const file = ctx.file;
  if (file) return { bytes: file.readBytes(), filename: file.name, format: ctx.format };
  if (ctx.content !== undefined) return { bytes: ctx.content, filename: ctx.filename ?? "import.cevio", format: ctx.format };
  throw new Error("Importer received no file content");
}

const importer = {
  id: ".score",
  name: "CeVIO score",
  role: "importer",
  extensions: ["ccs", "ccst"],
  onImport(ctx: DynamicImportContext) {
    const payload = readPayload(ctx);
    const extension = (payload.format ?? payload.filename.split(".").pop() ?? "").toLowerCase().replace(/^\./, "");
    const text = typeof payload.bytes === "string" ? payload.bytes : Encoding.convert(payload.bytes, { to: "UNICODE", from: "UTF8", type: "string", fallback: "error" });
    const diagnostics: ImportDiagnostic[] = [];
    return { tracks: parseCevio(text, payload.filename, extension, diagnostics), diagnostics };
  },
} as unknown as PluginDef;

plugin("import.cevio").version("0.1.0").name("CeVIO score importer").member(importer).register();
