import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import type { AuthorityHolder, ProgramInfo } from "../types.js";

export const LOADER_V1 = "BPFLoader1111111111111111111111111111111111";
export const LOADER_V2 = "BPFLoader2111111111111111111111111111111111";
export const LOADER_V3 = "BPFLoaderUpgradeab1e11111111111111111111111";
export const LOADER_V4 = "LoaderV411111111111111111111111111111111111";

const NONE_AUTHORITY: AuthorityHolder = {
  pubkey: null,
  exists: false,
  onCurve: false,
  classification: "none",
  owner: null,
  lamports: 0,
  details: {},
};

export function deriveProgramDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    new PublicKey(LOADER_V3)
  )[0];
}

export function parseProgramDataAccount(data: Buffer): {
  lastDeployedSlot: number;
  upgradeAuthorityPubkey: string | null;
  bytecodeOffset: number;
} {
  // Discriminator: bytes 0..4, must be 3 (u32 LE)
  const discriminator = data.readUInt32LE(0);
  if (discriminator !== 3) {
    throw new Error(`Unexpected ProgramData discriminator: ${discriminator}`);
  }

  // slot: bytes 4..12 (u64 LE) — read as two 32-bit halves to avoid BigInt precision issues
  const slotLo = data.readUInt32LE(4);
  const slotHi = data.readUInt32LE(8);
  const lastDeployedSlot = slotLo + slotHi * 0x100000000;

  // Option<upgrade_authority>: byte 12 (0 = None, 1 = Some)
  const hasAuthority = data[12] === 1;
  let upgradeAuthorityPubkey: string | null = null;
  if (hasAuthority) {
    upgradeAuthorityPubkey = new PublicKey(data.slice(13, 45)).toBase58();
  }

  // Bytecode starts at byte 45 (whether authority is Some or None the layout is fixed size)
  const bytecodeOffset = 45;

  return { lastDeployedSlot, upgradeAuthorityPubkey, bytecodeOffset };
}

export async function getProgramInfo(
  conn: Connection,
  programId: PublicKey,
  classifyFn: (pubkey: string | null) => Promise<AuthorityHolder>
): Promise<Omit<ProgramInfo, "upgradeHistory" | "verifiedBuild" | "anchorIdl">> {
  const accountInfo = await conn.getAccountInfo(programId);
  if (!accountInfo) {
    throw new Error(`Program account not found: ${programId.toBase58()}`);
  }
  if (!accountInfo.executable) {
    throw new Error(
      `Account ${programId.toBase58()} is not executable — not a program.`
    );
  }

  const loaderPubkey = accountInfo.owner.toBase58();
  let loaderVersion: ProgramInfo["loaderVersion"] = "unknown";
  if (loaderPubkey === LOADER_V1) loaderVersion = "v1";
  else if (loaderPubkey === LOADER_V2) loaderVersion = "v2";
  else if (loaderPubkey === LOADER_V3) loaderVersion = "v3";
  else if (loaderPubkey === LOADER_V4) loaderVersion = "v4";

  if (loaderVersion === "v1" || loaderVersion === "v2") {
    return {
      address: programId.toBase58(),
      loader: loaderPubkey,
      loaderVersion,
      executable: true,
      programDataAddress: null,
      lastDeployedSlot: null,
      bytecodeHash: null,
      bytecodeLength: null,
      upgradeAuthority: NONE_AUTHORITY,
    };
  }

  if (loaderVersion === "v4") {
    console.warn(
      `[WARN] Loader v4 detected for ${programId.toBase58()} — full v4 support is out of scope for v1. Returning stub.`
    );
    return {
      address: programId.toBase58(),
      loader: loaderPubkey,
      loaderVersion,
      executable: true,
      programDataAddress: null,
      lastDeployedSlot: null,
      bytecodeHash: null,
      bytecodeLength: null,
      upgradeAuthority: NONE_AUTHORITY,
    };
  }

  // v3 path
  const programDataAddress = deriveProgramDataAddress(programId);
  const programDataAccount = await conn.getAccountInfo(programDataAddress);
  if (!programDataAccount) {
    throw new Error(
      `ProgramData account not found: ${programDataAddress.toBase58()}`
    );
  }

  const { lastDeployedSlot, upgradeAuthorityPubkey, bytecodeOffset } =
    parseProgramDataAccount(Buffer.from(programDataAccount.data));

  const bytecode = Buffer.from(programDataAccount.data).slice(bytecodeOffset);
  const bytecodeHash =
    "sha256:" + createHash("sha256").update(bytecode).digest("hex");

  const upgradeAuthority = await classifyFn(upgradeAuthorityPubkey);

  return {
    address: programId.toBase58(),
    loader: loaderPubkey,
    loaderVersion,
    executable: true,
    programDataAddress: programDataAddress.toBase58(),
    lastDeployedSlot,
    bytecodeHash,
    bytecodeLength: bytecode.length,
    upgradeAuthority,
  };
}
