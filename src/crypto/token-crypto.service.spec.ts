import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TokenCryptoService } from "./token-crypto.service";

const originalKey = process.env.STOCKSHIELD_ENCRYPTION_KEY;

describe("TokenCryptoService", () => {
  afterEach(() => {
    process.env.STOCKSHIELD_ENCRYPTION_KEY = originalKey;
  });

  it("encrypts and decrypts token values", () => {
    process.env.STOCKSHIELD_ENCRYPTION_KEY = "test-encryption-key";
    const crypto = new TokenCryptoService();

    const encrypted = crypto.encrypt("shpat_secret");

    assert.match(encrypted, /^v1:/);
    assert.notEqual(encrypted, "shpat_secret");
    assert.equal(crypto.decrypt(encrypted), "shpat_secret");
  });

  it("rejects unsupported encrypted token formats", () => {
    const crypto = new TokenCryptoService();

    assert.throws(
      () => crypto.decrypt("not-a-valid-token"),
      /Unsupported encrypted token format/,
    );
  });
});
