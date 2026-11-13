import { isoBase64URL } from "@simplewebauthn/server/helpers";

function decodeCredentialId(value: string): Uint8Array<ArrayBuffer> {
  const decoded = isoBase64URL.toBuffer(value);
  const copy = new Uint8Array(decoded.byteLength);
  copy.set(decoded);
  return copy;
}

export function normalizeCredentialId(value: unknown): string | null {
  if (typeof value !== "string" || !isoBase64URL.isBase64URL(value)) {
    return null;
  }

  try {
    return isoBase64URL.fromBuffer(decodeCredentialId(value));
  } catch {
    return null;
  }
}

export function credentialIdToJSON(value: string): string {
  return isoBase64URL.fromBuffer(decodeCredentialId(value));
}
