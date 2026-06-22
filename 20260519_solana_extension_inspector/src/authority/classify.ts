import { Connection, PublicKey } from "@solana/web3.js";
import type { AuthorityHolder } from "../types.js";
import { classifySquadsAccount, detectSquadsVault } from "./squads.js";
import { classifyGovernance } from "./governance.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export function createClassifier(conn: Connection) {
  const cache = new Map<string, AuthorityHolder>();

  async function classifyAuthority(pubkey: string | null): Promise<AuthorityHolder> {
    if (pubkey === null) {
      return {
        pubkey: null,
        exists: false,
        onCurve: false,
        classification: "none",
        owner: null,
        lamports: 0,
        details: {},
      };
    }

    if (cache.has(pubkey)) {
      return cache.get(pubkey)!;
    }

    const key = new PublicKey(pubkey);
    const onCurve = PublicKey.isOnCurve(key.toBuffer());
    const accountInfo = await conn.getAccountInfo(key);

    let result: AuthorityHolder;

    if (!accountInfo) {
      result = {
        pubkey,
        exists: false,
        onCurve,
        // Off-curve addresses have no valid private key, so they are PDAs regardless
        // of whether they hold an on-chain account. Only on-curve non-existent addresses
        // are truly unfunded EOAs (valid keypairs that haven't been funded yet).
        classification: onCurve ? "unfunded_eoa" : "system_pda",
        owner: null,
        lamports: 0,
        details: {},
      };
    } else {
      const owner = accountInfo.owner.toBase58();
      let details: Record<string, unknown> = {};
      let classification: AuthorityHolder["classification"];

      if (owner === SYSTEM_PROGRAM) {
        if (onCurve) {
          // True EOA: a keypair wallet funded with SOL
          classification = "eoa";
        } else {
          // Off-curve + system-owned = a PDA that holds SOL (e.g. Squads vault).
          // The PDA's *executing* program is not visible from account ownership alone;
          // we need to infer it from transaction history.
          const vaultDetails = await detectSquadsVault(conn, key);
          if (vaultDetails) {
            classification = "squads_multisig";
            details = vaultDetails;
          } else {
            classification = "system_pda";
          }
        }
      } else {
        const squadsResult = await classifySquadsAccount(conn, key, owner);
        if (squadsResult) {
          classification = "squads_multisig";
          details = squadsResult;
        } else {
          const govResult = await classifyGovernance(conn, key, owner);
          if (govResult) {
            classification = "spl_governance";
            details = govResult;
          } else {
            classification = "program_owned_other";
          }
        }
      }

      result = {
        pubkey,
        exists: true,
        onCurve,
        classification,
        owner,
        lamports: accountInfo.lamports,
        details,
      };
    }

    cache.set(pubkey, result);
    return result;
  }

  return classifyAuthority;
}
