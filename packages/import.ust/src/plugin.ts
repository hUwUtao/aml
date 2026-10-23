import { plugin } from "@amsvs/api";
import type { DynamicImportContext, PluginDef } from "@amsvs/api";
import { importScore } from "./importer";

const PLUGIN_ID = "import.ust";
const PLUGIN_VERSION = "0.1.1";

function readPayload(ctx: DynamicImportContext): { bytes: Uint8Array | string; filename: string; format?: string } {
  const file = ctx.file;
  if (file) return { bytes: file.readBytes(), filename: file.name, format: ctx.format };
  if (ctx.content !== undefined) return { bytes: ctx.content, filename: ctx.filename ?? "import.ust", format: ctx.format };
  throw new Error("Importer received no file content");
}

const importer = {
  id: ".score",
  name: "UTAU / OpenUtau score",
  role: "importer",
  extensions: ["ust", "ustx"],
  onImport(ctx: DynamicImportContext) {
    const payload = readPayload(ctx);
    return importScore(payload.format, payload.bytes, payload.filename);
  },
} as unknown as PluginDef;

plugin(PLUGIN_ID)
  .version(PLUGIN_VERSION)
  .name("UTAU / OpenUtau score importer")
  .member(importer)
  .register();
