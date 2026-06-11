import { PublicKey } from "@solana/web3.js";

export interface NetworkConfig {
  name: string;
  defaultRpc: string;
  mMint: PublicKey;
  earnProgram: PublicKey;
  portalProgram: PublicKey;
  wormholeAdapterProgram: PublicKey;
  hyperlaneAdapterProgram: PublicKey;
  extSwapProgram: PublicKey;
  /** legacy earn program whose global PDA shows up in stale docs — flagged specially */
  legacyEarnProgram: PublicKey;
  /** human labels for well-known extension program IDs */
  knownExtensions: Record<string, string>;
  /** staleness threshold for the $M index, seconds */
  indexStaleAfterSeconds: number;
  /** EVM hub (Ethereum / Sepolia) — source of the $M index and earner merkle root */
  ethRpc: string;
  ethMToken: string;
  ethMerkleTreeBuilder: string;
}

// Program IDs are identical on devnet and mainnet (separate state per cluster).
const SHARED = {
  mMint: new PublicKey("mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH"),
  earnProgram: new PublicKey("mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z"),
  portalProgram: new PublicKey("MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce"),
  wormholeAdapterProgram: new PublicKey("mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY"),
  hyperlaneAdapterProgram: new PublicKey("mZhPGteS36G7FhMTcRofLQU8ocBNAsGq7u8SKSHfL2X"),
  extSwapProgram: new PublicKey("MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH"),
  legacyEarnProgram: new PublicKey("MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c"),
  knownExtensions: {
    wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko: "wM",
    mexteGyWXgUR65XepNKtLJ2H66MmyLWrDSeA1bqzZ4C: "XO",
    extMahs9bUFMYcviKCvnSRaXgs5PcqmMzcnHRtTqE85: "USDKY (yield-bot cfg)",
    Fb2AsCKmPd4gKhabT6KsremSHMrJ8G2Mopnc6rDQZX9e: "USDK",
    "3PskKTHgboCbUSQPMcCAZdZNFHbNvSoZ8zEFYANCdob7": "USDKY",
    extUkDFf3HLekkxbcZ3XRUizMjbxMJgKBay3p9xGVmg: "extUSD", // metaplex metadata name; mint vanity prefix is fUSD
  },
};

export const NETWORKS: Record<string, NetworkConfig> = {
  devnet: {
    name: "devnet",
    defaultRpc: "https://api.devnet.solana.com",
    indexStaleAfterSeconds: 7 * 24 * 3600, // devnet propagation is best-effort
    ethRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    // $M lives at the same address on Sepolia as on mainnet; the merkle tree builder differs
    ethMToken: "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b",
    ethMerkleTreeBuilder: "0x050258e4761650ad774b5090a5DA0e204348Eb48",
    ...SHARED,
  },
  mainnet: {
    name: "mainnet",
    defaultRpc: "https://api.mainnet-beta.solana.com",
    indexStaleAfterSeconds: 24 * 3600,
    ethRpc: "https://ethereum-rpc.publicnode.com",
    ethMToken: "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b",
    ethMerkleTreeBuilder: "0xCab755D715f312AD946d6982b8778BFAD7E322d7",
    ...SHARED,
  },
};

/* PDA seeds (identical across programs by convention) */
export const SEED_GLOBAL = Buffer.from("global");
export const SEED_M_VAULT = Buffer.from("m_vault");
export const SEED_MINT_AUTHORITY = Buffer.from("mint_authority");
export const SEED_PORTAL_AUTHORITY = Buffer.from("authority");

export function globalPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED_GLOBAL], programId)[0];
}
export function mVaultPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED_M_VAULT], programId)[0];
}
export function extMintAuthorityPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED_MINT_AUTHORITY], programId)[0];
}
export function portalAuthorityPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEED_PORTAL_AUTHORITY], programId)[0];
}
// Hyperlane account-metas PDA, see solana-portal hyperlane-adapter state
export function hyperlaneAccountMetasPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("hyperlane_message_recipient"),
      Buffer.from("-"),
      Buffer.from("handle"),
      Buffer.from("-"),
      Buffer.from("account_metas"),
    ],
    programId
  )[0];
}
