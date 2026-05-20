import { describe, it, expect } from "vitest";
import { parseProgramDataAccount, deriveProgramDataAddress } from "../program/info.js";
import { PublicKey } from "@solana/web3.js";

function buildProgramDataBuffer(opts: {
  slot: bigint;
  authorityPubkey?: string;
}): Buffer {
  const buf = Buffer.alloc(45 + 100);
  // discriminator = 3 (u32 LE)
  buf.writeUInt32LE(3, 0);
  // slot (u64 LE) split into two u32s
  const slotLo = Number(opts.slot & 0xffffffffn);
  const slotHi = Number(opts.slot >> 32n);
  buf.writeUInt32LE(slotLo, 4);
  buf.writeUInt32LE(slotHi, 8);

  if (opts.authorityPubkey) {
    buf[12] = 1; // Some
    const keyBytes = new PublicKey(opts.authorityPubkey).toBuffer();
    keyBytes.copy(buf, 13);
  } else {
    buf[12] = 0; // None
  }
  // fill bytecode region with 0xBE
  buf.fill(0xbe, 45);
  return buf;
}

describe("parseProgramDataAccount", () => {
  it("parses slot and authority pubkey when Some", () => {
    const authority = "11111111111111111111111111111112";
    const buf = buildProgramDataBuffer({ slot: 123456789n, authorityPubkey: authority });
    const result = parseProgramDataAccount(buf);
    expect(result.lastDeployedSlot).toBe(123456789);
    expect(result.upgradeAuthorityPubkey).toBe(authority);
    expect(result.bytecodeOffset).toBe(45);
  });

  it("returns null authority when None", () => {
    const buf = buildProgramDataBuffer({ slot: 1n });
    const result = parseProgramDataAccount(buf);
    expect(result.upgradeAuthorityPubkey).toBeNull();
  });

  it("handles large slot values correctly", () => {
    const slot = 0x1_0000_0000n; // exceeds 32-bit
    const buf = buildProgramDataBuffer({ slot });
    const result = parseProgramDataAccount(buf);
    expect(result.lastDeployedSlot).toBe(Number(slot));
  });

  it("throws on wrong discriminator", () => {
    const buf = Buffer.alloc(50);
    buf.writeUInt32LE(0, 0);
    expect(() => parseProgramDataAccount(buf)).toThrow("discriminator");
  });
});

describe("deriveProgramDataAddress", () => {
  it("derives a deterministic PDA for a known program", () => {
    const programId = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const pda = deriveProgramDataAddress(programId);
    expect(pda).toBeInstanceOf(PublicKey);
    // Same input must produce same output
    expect(deriveProgramDataAddress(programId).toBase58()).toBe(pda.toBase58());
  });
});
