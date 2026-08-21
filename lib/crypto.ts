//**
// lib/crypto.ts
// AES-256-GCM encryption for BYOK keys at rest + keyed IP hashing for rate limits
//**
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

// AES-256-GCM for BYOK keys at rest. Stored format: base64(iv):base64(tag):base64(cipher)
function keyBytes(): Buffer {
  const raw = Buffer.from(env.encryptionKey, "base64");
  if (raw.length === 32) return raw;
  // Whatever shape the env secret is, derive exactly 32 bytes deterministically.
  return createHash("sha256").update(env.encryptionKey).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function hashIp(ip: string): string {
  // Keyed hash — rate limiting needs equality, never the address itself.
  return createHash("sha256").update(`${ip}|${env.encryptionKey}`).digest("hex").slice(0, 32);
}
