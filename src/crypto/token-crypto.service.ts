import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

@Injectable()
export class TokenCryptoService {
  private readonly key = createHash("sha256")
    .update(process.env.STOCKSHIELD_ENCRYPTION_KEY ?? "stockshield-dev-key-change-me")
    .digest();

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
  }

  decrypt(value: string): string {
    const [version, iv, tag, encrypted] = value.split(":");

    if (version !== "v1" || !iv || !tag || !encrypted) {
      throw new Error("Unsupported encrypted token format");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
