export function toBase64(arr: Uint8Array): string {
  return btoa(Array.from(arr).map(b => String.fromCharCode(b)).join(''));
}

export function fromBase64(str: string): Uint8Array {
  return new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));
}

export async function deriveKey(recoveryCode: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(recoveryCode),
    { name: "PBKDF2" },
    false, // extractable
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true, // Must be extractable to derive node keys or wrap them
    ["encrypt", "decrypt"]
  );
}

export async function generateNodeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyRaw(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return toBase64(new Uint8Array(exported));
}

export async function importKeyRaw(base64Str: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Str);
  return crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptNodeKey(nodeKey: CryptoKey, wrappingKey: CryptoKey): Promise<{ encryptedKey: string, iv: string }> {
  const rawKey = await crypto.subtle.exportKey("raw", nodeKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    rawKey
  );
  return {
    encryptedKey: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function decryptNodeKey(encryptedKeyBase64: string, wrappingKey: CryptoKey, ivBase64: string): Promise<CryptoKey> {
  const encrypted = fromBase64(encryptedKeyBase64);
  const iv = fromBase64(ivBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    wrappingKey,
    encrypted as unknown as BufferSource
  );
  return crypto.subtle.importKey(
    "raw",
    decrypted,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text: string, key: CryptoKey): Promise<{ cipherText: string, iv: string }> {
  const enc = new TextEncoder();
  const buffer = enc.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buffer
  );
  return {
    cipherText: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function decryptText(cipherTextBase64: string, key: CryptoKey, ivBase64: string): Promise<string> {
  const encrypted = fromBase64(cipherTextBase64);
  const iv = fromBase64(ivBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encrypted as unknown as BufferSource
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

export async function encryptFile(file: File | Blob, key: CryptoKey): Promise<{ encryptedBlob: Blob, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buffer = await file.arrayBuffer();
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buffer
  );

  return {
    encryptedBlob: new Blob([encryptedBuffer], { type: file.type }),
    iv: toBase64(iv),
  };
}

export async function decryptFile(encryptedBuffer: ArrayBuffer, key: CryptoKey, ivBase64: string): Promise<Blob> {
  const iv = fromBase64(ivBase64);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encryptedBuffer as BufferSource
  );
  return new Blob([decryptedBuffer]);
}

export async function encryptMetadata(metadata: Record<string, unknown>, key: CryptoKey): Promise<{ encryptedMeta: string, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const buffer = enc.encode(JSON.stringify(metadata));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buffer
  );

  return {
    encryptedMeta: toBase64(new Uint8Array(encryptedBuffer)),
    iv: toBase64(iv)
  };
}

export async function decryptMetadata(encryptedMetaBase64: string, key: CryptoKey, ivBase64: string): Promise<Record<string, unknown>> {
  const iv = fromBase64(ivBase64);
  const encryptedBuffer = fromBase64(encryptedMetaBase64).buffer;

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encryptedBuffer as BufferSource
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedBuffer));
}

