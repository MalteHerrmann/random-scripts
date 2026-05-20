import { Connection, PublicKey } from "@solana/web3.js";

const SPL_GOVERNANCE_PROGRAM_ID = "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";

const GOVERNANCE_ACCOUNT_TYPES: Record<number, string> = {
  2: "Realm",
  3: "TokenOwnerRecord",
  4: "Governance",
  5: "ProgramGovernance",
  6: "Proposal",
  7: "ProposalInstruction",
  8: "VoteRecord",
  9: "MintGovernance",
  10: "TokenGovernance",
};

export async function classifyGovernance(
  conn: Connection,
  pubkey: PublicKey,
  owner: string
): Promise<Record<string, unknown> | null> {
  if (owner !== SPL_GOVERNANCE_PROGRAM_ID) {
    return null;
  }

  try {
    const accountInfo = await conn.getAccountInfo(pubkey);
    if (!accountInfo) return { programId: SPL_GOVERNANCE_PROGRAM_ID };

    const accountType = accountInfo.data[0];
    return {
      programId: SPL_GOVERNANCE_PROGRAM_ID,
      accountType: GOVERNANCE_ACCOUNT_TYPES[accountType] ?? `Unknown(${accountType})`,
    };
  } catch {
    return { programId: SPL_GOVERNANCE_PROGRAM_ID };
  }
}
