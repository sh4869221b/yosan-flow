type HistoryIdCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createHistoryId(): string {
  const cryptoObject = globalThis.crypto as HistoryIdCrypto | undefined;
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  if (typeof cryptoObject?.getRandomValues === "function") {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytes);
  }

  throw new Error("Web Crypto is required to create history IDs");
}
