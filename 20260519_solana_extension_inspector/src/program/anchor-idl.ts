import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import type { AnchorIdlInfo } from "../types.js";

export async function getAnchorIdl(
  conn: Connection,
  programId: PublicKey
): Promise<AnchorIdlInfo> {
  let idl;
  try {
    // fetchIdl derives the IDL PDA, fetches the account, inflates and parses it.
    // It only reads from `provider.connection`, so a minimal provider suffices.
    idl = await Program.fetchIdl(programId, { connection: conn });
  } catch {
    return { present: false };
  }

  if (!idl) {
    return { present: false };
  }

  return {
    present: true,
    name: idl.metadata?.name,
    version: idl.metadata?.version,
    instructions: idl.instructions?.map((ix) => ix.name) ?? [],
  };
}
