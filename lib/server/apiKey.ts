import crypto from "crypto";

export function generateApiKey(): { plain: string; prefix: string; hash: string } {
  const plain = `ho_${crypto.randomBytes(24).toString("hex")}`;
  const prefix = plain.slice(0, 10);
  const hash = hashApiKey(plain);
  return { plain, prefix, hash };
}

export function hashApiKey(plain: string): string {
  return crypto.createHash("sha256").update(plain, "utf8").digest("hex");
}

