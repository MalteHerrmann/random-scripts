import { PublicKey } from "@solana/web3.js";
import { HubState } from "./evm.js";

export type Status = "ok" | "warn" | "fail" | "info";

export interface Finding {
  /** stable id, e.g. "C2" or "E6" */
  id: string;
  /** what the check is about, e.g. "ext:wMXX…" or "core:earn" */
  subject: string;
  title: string;
  status: Status;
  expected?: string;
  actual?: string;
  /** how to fix it (existing CLI command / runbook) */
  remediation?: string;
}

export type Variant = "no-yield" | "scaled-ui" | "crank";

/** Decoded Token2022 ScaledUiAmount extension */
export interface ScaledUiAmountConfig {
  authority: PublicKey | null;
  multiplier: number;
  newMultiplierEffectiveTimestamp: number;
  newMultiplier: number;
}

export interface MintInfo {
  address: PublicKey;
  tokenProgram: PublicKey;
  decimals: number;
  supply: bigint;
  mintAuthority: PublicKey | null;
  freezeAuthority: PublicKey | null;
  scaledUiAmount: ScaledUiAmountConfig | null;
  defaultAccountState: "initialized" | "frozen" | null;
  permanentDelegate: PublicKey | null;
}

export interface ProgramInfo {
  programId: PublicKey;
  exists: boolean;
  executable: boolean;
  upgradeAuthority: PublicKey | null;
}

/* ---- decoded account shapes (field names follow the vendored IDLs, snake_case) ---- */

export interface EarnGlobal {
  admin: PublicKey;
  m_mint: PublicKey;
  portal_authority: PublicKey;
  ext_swap_global_account: PublicKey;
  earner_merkle_root: number[];
  bump: number;
}

export interface PortalGlobal {
  bump: number;
  chain_id: number;
  m_mint: PublicKey;
  admin: PublicKey;
  outgoing_paused: boolean;
  incoming_paused: boolean;
  m_index: bigint;
  message_nonce: bigint;
  pending_admin: PublicKey | null;
  isolated_hub_chain_id: number | null;
  unclaimed_m_balance: bigint;
}

export interface BridgePath {
  source_mint: PublicKey;
  destination_token: number[];
}

export interface ChainBridgePaths {
  bump: number;
  destination_chain_id: number;
  paths: BridgePath[];
}

export interface Peer {
  address: number[];
  m0_chain_id: number;
  adapter_chain_id: number;
}

export interface WormholeGlobal {
  bump: number;
  admin: PublicKey;
  outgoing_paused: boolean;
  incoming_paused: boolean;
  chain_id: number;
  receive_lut: PublicKey | null;
  pending_admin: PublicKey | null;
  peers: Peer[];
}

export interface HyperlaneGlobal {
  bump: number;
  admin: PublicKey;
  outgoing_paused: boolean;
  incoming_paused: boolean;
  chain_id: number;
  igp_program_id: PublicKey;
  igp_gas_amount: bigint;
  igp_account: PublicKey;
  igp_overhead_account: PublicKey | null;
  ism: PublicKey | null;
  pending_admin: PublicKey | null;
  peers: Peer[];
}

export interface RegisteredExtension {
  program_id: PublicKey;
  mint: PublicKey;
  token_program: PublicKey;
}

export interface AccountMetasData {
  bump: number;
  m_mint: PublicKey;
  extensions: RegisteredExtension[];
}

export interface SwapGlobal {
  bump: number;
  admin: PublicKey;
  whitelisted_unwrappers: PublicKey[];
  whitelisted_extensions: RegisteredExtension[];
}

export interface YieldConfigNoYield {
  yield_variant: number;
}
export interface YieldConfigScaledUi {
  yield_variant: number;
  fee_bps: bigint;
  last_m_index: bigint;
  last_ext_index: bigint;
}
export interface YieldConfigCrank {
  yield_variant: number;
  earn_authority: PublicKey;
  last_m_index: bigint;
  last_ext_index: bigint;
  timestamp: bigint;
}

export interface ExtGlobalV2 {
  admin: PublicKey;
  pending_admin: PublicKey | null;
  ext_mint: PublicKey;
  m_mint: PublicKey;
  m_earn_global_account: PublicKey;
  bump: number;
  m_vault_bump: number;
  ext_mint_authority_bump: number;
  yield_config: YieldConfigNoYield | YieldConfigScaledUi | YieldConfigCrank;
  wrap_authorities: PublicKey[];
}

/* ---- resolved graph ---- */

export interface CoreState {
  mMint: MintInfo | null;
  mMintAddress: PublicKey;
  earn: {
    program: ProgramInfo;
    globalPda: PublicKey;
    globalExists: boolean;
    global: EarnGlobal | null;
    lastActivity: Date | null;
  };
  portal: {
    program: ProgramInfo;
    globalPda: PublicKey;
    globalExists: boolean;
    authorityPda: PublicKey;
    global: PortalGlobal | null;
    bridgePaths: ChainBridgePaths[];
    /** null when getProgramAccounts is unavailable on the RPC */
    bridgePathsAvailable: boolean;
  };
  wormhole: {
    program: ProgramInfo;
    globalPda: PublicKey;
    globalExists: boolean;
    global: WormholeGlobal | null;
  };
  hyperlane: {
    program: ProgramInfo;
    globalPda: PublicKey;
    globalExists: boolean;
    global: HyperlaneGlobal | null;
    accountMetasPda: PublicKey;
    accountMetas: AccountMetasData | null;
  };
  extSwap: {
    program: ProgramInfo;
    globalPda: PublicKey;
    globalExists: boolean;
    global: SwapGlobal | null;
  };
}

export type AtaState = "missing" | "frozen" | "initialized";

export interface ExtensionState {
  programId: PublicKey;
  program: ProgramInfo;
  globalPda: PublicKey;
  globalExists: boolean;
  global: ExtGlobalV2 | null;
  variant: Variant | null;
  /** set when the account uses an older struct generation than current source */
  layoutNote: string | null;
  extMint: MintInfo | null;
  mVaultPda: PublicKey;
  extMintAuthorityPda: PublicKey;
  vaultMAta: PublicKey;
  vaultAtaState: AtaState;
  vaultMUiBalance: number | null;
  /** label resolved from known addresses (wM, XO, …) if any */
  label: string | null;
}

export interface Graph {
  network: string;
  rpcUrl: string;
  fetchedAt: Date;
  core: CoreState;
  extensions: ExtensionState[];
  /** EVM hub snapshot; null when unreachable or --no-evm */
  hub: HubState | null;
}
