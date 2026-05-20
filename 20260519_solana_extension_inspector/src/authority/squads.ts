import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const SQUADS_PROGRAM_IDS = new Set([
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
  "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu",
]);

function getSquadsProgramId(owner?: string): PublicKey | null {
  const id = owner ?? "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
  if (!SQUADS_PROGRAM_IDS.has(id)) return null;
  return new PublicKey(id);
}

// Classify an account whose owner IS the Squads program (the multisig state account itself).
export async function classifySquadsAccount(
  conn: Connection,
  pubkey: PublicKey,
  owner: string
): Promise<Record<string, unknown> | null> {
  if (!SQUADS_PROGRAM_IDS.has(owner)) return null;

  try {
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(conn, pubkey);
    return {
      multisigAddress: pubkey.toBase58(),
      threshold: multisigAccount.threshold,
      memberCount: multisigAccount.members.length,
      members: multisigAccount.members.map((m) => ({
        key: m.key.toBase58(),
        permissions: m.permissions,
      })),
      transactionIndex: multisigAccount.transactionIndex.toString(),
    };
  } catch {
    return { parseError: true };
  }
}

// Detect if an off-curve, system-owned PDA is a Squads vault by scanning its recent
// transaction history for Squads program instructions and extracting the multisig address.
export async function detectSquadsVault(
  conn: Connection,
  vaultPubkey: PublicKey
): Promise<Record<string, unknown> | null> {
  let signatures;
  try {
    signatures = await conn.getSignaturesForAddress(vaultPubkey, { limit: 20 });
  } catch {
    return null;
  }

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

    // Look for an instruction from a Squads program
    for (const ix of tx.transaction.message.instructions) {
      if (!("programId" in ix)) continue;
      const progId = ix.programId.toBase58();
      const squadsProgramId = getSquadsProgramId(progId);
      if (!squadsProgramId) continue;

      // The multisig account is always the first account in a Squads instruction
      const accountKeys = tx.transaction.message.accountKeys;
      const ixAccounts = "accounts" in ix ? (ix.accounts as PublicKey[]) : [];
      if (ixAccounts.length === 0) continue;

      const multisigAddress = ixAccounts[0];
      if (!multisigAddress) continue;

      // Verify the vault PDA is actually derived from this multisig
      for (let index = 0; index < 8; index++) {
        try {
          const [derived] = multisig.getVaultPda({
            multisigPda: multisigAddress,
            index,
            programId: squadsProgramId,
          });
          if (derived.equals(vaultPubkey)) {
            // Confirmed — fetch the multisig account for details
            try {
              const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
                conn,
                multisigAddress
              );
              return {
                multisigAddress: multisigAddress.toBase58(),
                vaultIndex: index,
                threshold: multisigAccount.threshold,
                memberCount: multisigAccount.members.length,
                members: multisigAccount.members.map((m) => ({
                  key: m.key.toBase58(),
                  permissions: m.permissions,
                })),
                transactionIndex: multisigAccount.transactionIndex.toString(),
              };
            } catch {
              return {
                multisigAddress: multisigAddress.toBase58(),
                vaultIndex: index,
              };
            }
          }
        } catch {
          continue;
        }
      }

      // Also check: sometimes the vault appears as a non-first account. Scan all accounts.
      for (const accountKey of accountKeys) {
        const addr = accountKey.pubkey;
        if (addr.equals(vaultPubkey)) continue; // skip the vault itself
        for (let index = 0; index < 8; index++) {
          try {
            const [derived] = multisig.getVaultPda({
              multisigPda: addr,
              index,
              programId: squadsProgramId,
            });
            if (derived.equals(vaultPubkey)) {
              try {
                const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
                  conn,
                  addr
                );
                return {
                  multisigAddress: addr.toBase58(),
                  vaultIndex: index,
                  threshold: multisigAccount.threshold,
                  memberCount: multisigAccount.members.length,
                  members: multisigAccount.members.map((m) => ({
                    key: m.key.toBase58(),
                    permissions: m.permissions,
                  })),
                  transactionIndex: multisigAccount.transactionIndex.toString(),
                };
              } catch {
                return { multisigAddress: addr.toBase58(), vaultIndex: index };
              }
            }
          } catch {
            continue;
          }
        }
      }
    }
  }

  return null;
}
