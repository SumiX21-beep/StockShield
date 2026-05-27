import { Injectable } from "@nestjs/common";
import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const pbkdf2 = promisify(pbkdf2Callback);
const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 120_000;
const KEY_LENGTH = 32;

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(16).toString("hex");
    const digest = await pbkdf2(password, salt, HASH_ITERATIONS, KEY_LENGTH, HASH_ALGORITHM);
    return `pbkdf2:${HASH_ITERATIONS}:${salt}:${digest.toString("hex")}`;
  }

  async verify(password: string, storedHash: string) {
    const parts = storedHash.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return false;
    }

    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = Buffer.from(parts[3], "hex");
    if (!Number.isFinite(iterations) || !salt || expected.length === 0) {
      return false;
    }

    const actual = await pbkdf2(password, salt, iterations, expected.length, HASH_ALGORITHM);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
