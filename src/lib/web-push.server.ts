// Minimal Web Push sender: RFC 8030 delivery, RFC 8291 payload encryption
// (aes128gcm) and RFC 8292 VAPID, written on WebCrypto so it runs unchanged
// on Cloudflare Workers and Node — the popular `web-push` package relies on
// Node-only crypto/http APIs. Server-only: it reads the VAPID private key.

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// "sent" delivered to the push service; "gone" the subscription is dead (or
// not a real push endpoint) and should be deleted; "failed" a transient
// problem worth ignoring this time.
export type PushResult = "sent" | "gone" | "failed";

const encoder = new TextEncoder();

// Endpoints are supplied by anonymous riders, so the server must never POST
// to an arbitrary URL — only to the push services browsers actually use.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
}

export function isPushConfigured(): boolean {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

export function getVapidPublicKey(): string | null {
  return isPushConfigured() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// RFC 8291 §3.4 with the RFC 8188 single-record layout. Split from
// encryptPayload so a test can pin the salt and the server's key pair.
export async function encryptWithKeys(
  plaintext: Uint8Array<ArrayBuffer>,
  userPublicKey: Uint8Array<ArrayBuffer>,
  authSecret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  serverKeys: CryptoKeyPair,
): Promise<Uint8Array<ArrayBuffer>> {
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey),
  );
  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, serverKeys.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), userPublicKey, serverPublicKey);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // 0x02 marks this as the last (and only) record.
  const record = concat(plaintext, Uint8Array.of(2));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(
    salt,
    recordSize,
    Uint8Array.of(serverPublicKey.length),
    serverPublicKey,
    ciphertext,
  );
}

async function encryptPayload(
  plaintext: Uint8Array<ArrayBuffer>,
  p256dh: string,
  auth: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return encryptWithKeys(plaintext, fromBase64Url(p256dh), fromBase64Url(auth), salt, serverKeys);
}

let vapidSigningKey: Promise<CryptoKey> | undefined;

function getVapidSigningKey(): Promise<CryptoKey> {
  vapidSigningKey ??= (() => {
    const publicKey = fromBase64Url(process.env.VAPID_PUBLIC_KEY ?? "");
    return crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: toBase64Url(publicKey.slice(1, 33)),
        y: toBase64Url(publicKey.slice(33, 65)),
        d: process.env.VAPID_PRIVATE_KEY ?? "",
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  })();
  return vapidSigningKey;
}

async function vapidAuthorization(endpoint: string): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: process.env.VAPID_SUBJECT,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await getVapidSigningKey(),
    encoder.encode(`${header}.${claims}`),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(new Uint8Array(signature))}, k=${process.env.VAPID_PUBLIC_KEY}`;
}

export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  message: PushMessage,
): Promise<PushResult> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) return "gone";
  try {
    const body = await encryptPayload(
      encoder.encode(JSON.stringify(message)),
      subscription.p256dh,
      subscription.auth,
    );
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return "sent";
    if (res.status === 404 || res.status === 410) return "gone";
    console.warn(`[web-push] ${new URL(subscription.endpoint).hostname} answered ${res.status}`);
    return "failed";
  } catch (err) {
    console.warn("[web-push] send failed", err);
    return "failed";
  }
}
