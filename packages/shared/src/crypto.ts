import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes is standard for GCM

export function encrypt(text: string): string {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("ENCRYPTION_KEY environment variable is not defined");
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:encryptedText:authTag
  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

export function decrypt(encryptedText: string): string {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("ENCRYPTION_KEY environment variable is not defined");
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)");
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
