import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorIdlInfo } from "../types.js";

const ANCHOR_IDL_SEED = "anchor:idl";

async function deriveIdlAddress(programId: PublicKey): Promise<PublicKey> {
  const base = PublicKey.findProgramAddressSync([], programId)[0];
  // createWithSeed is async
  return PublicKey.createWithSeed(base, ANCHOR_IDL_SEED, programId);
}

interface AnchorIdlRaw {
  name?: string;
  version?: string;
  metadata?: { name?: string; version?: string };
  instructions?: Array<{ name: string }>;
}

export async function getAnchorIdl(
  conn: Connection,
  programId: PublicKey
): Promise<AnchorIdlInfo> {
  let idlAddress: PublicKey;
  try {
    idlAddress = await deriveIdlAddress(programId);
  } catch {
    return { present: false };
  }

  let idlAccount;
  try {
    idlAccount = await conn.getAccountInfo(idlAddress);
  } catch {
    return { present: false };
  }

  if (!idlAccount) {
    return { present: false };
  }

  try {
    const data = Buffer.from(idlAccount.data);
    // 8-byte discriminator, 32-byte authority, 4-byte data length, zlib-compressed JSON
    let offset = 8 + 32;
    const dataLen = data.readUInt32LE(offset);
    offset += 4;
    const compressed = data.slice(offset, offset + dataLen);

    const { inflateSync } = await import("zlib");
    const decompressed = inflateSync(compressed);
    const idl: AnchorIdlRaw = JSON.parse(decompressed.toString("utf8"));

    const name = idl.metadata?.name ?? idl.name;
    const version = idl.metadata?.version ?? idl.version;
    const instructions = Array.isArray(idl.instructions)
      ? idl.instructions.map((ix) => ix.name)
      : [];

    return { present: true, name, version, instructions };
  } catch {
    return { present: true };
  }
}
