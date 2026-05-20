import { Connection, PublicKey } from "@solana/web3.js";
import type { UpgradeEvent } from "../types.js";

const BPF_LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";

export async function getUpgradeHistory(
  conn: Connection,
  programDataAddress: PublicKey,
  limit = 100
): Promise<{ history: UpgradeEvent[]; warning?: string }> {
  let signatures;
  try {
    signatures = await conn.getSignaturesForAddress(programDataAddress, {
      limit,
    });
  } catch (err) {
    return {
      history: [],
      warning: `Failed to fetch signatures: ${String(err)}`,
    };
  }

  const events: UpgradeEvent[] = [];

  for (const sigInfo of signatures) {
    let tx;
    try {
      tx = await conn.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      continue;
    }
    if (!tx) continue;

    const instructions = tx.transaction.message.instructions;
    const isUpgrade = instructions.some((ix) => {
      if (!("program" in ix)) return false;
      if (ix.program !== BPF_LOADER_UPGRADEABLE) return false;
      if (!("parsed" in ix) || !ix.parsed) return false;
      const type = (ix.parsed as { type?: string }).type;
      return type === "upgrade" || type === "deployWithMaxDataLen";
    });

    if (!isUpgrade) continue;

    const signer =
      tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? "";

    events.push({
      slot: tx.slot,
      signature: sigInfo.signature,
      signer,
    });
  }

  // Return chronologically ascending
  events.sort((a, b) => a.slot - b.slot);
  return { history: events };
}
