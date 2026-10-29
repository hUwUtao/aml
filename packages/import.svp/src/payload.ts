import * as Encoding from "encoding-japanese";

export function decodeSvp(payload: Uint8Array | string): string {
  if (typeof payload === "string") return payload.replace(/^\uFEFF/, "").replace(/[\0\t\n\r ]+$/, "");

  // Strip the UTF-8 BOM and NUL terminator/padding before decoding JSON text.
  const start = payload[0] === 0xef && payload[1] === 0xbb && payload[2] === 0xbf ? 3 : 0;
  let end = payload.length;
  while (end > start) {
    const byte = payload[end - 1];
    if (byte !== 0 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x20) break;
    end--;
  }
  return Encoding.convert(payload.subarray(start, end), { to: "UNICODE", from: "UTF8", type: "string", fallback: "error" });
}
