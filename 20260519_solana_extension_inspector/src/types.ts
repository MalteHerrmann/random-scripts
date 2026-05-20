export type AuthorityClassification =
  | "eoa"
  | "squads_multisig"
  | "spl_governance"
  | "program_owned_other"
  | "system_pda"        // off-curve, system-owned, but not identified as a known multisig vault
  | "none"
  | "unfunded_eoa";

export interface AuthorityHolder {
  pubkey: string | null;
  exists: boolean;
  onCurve: boolean;
  classification: AuthorityClassification;
  owner: string | null;
  lamports: number;
  details: Record<string, unknown>;
}

export interface UpgradeEvent {
  slot: number;
  signature: string;
  signer: string;
}

export interface AnchorIdlInfo {
  present: boolean;
  name?: string;
  version?: string;
  instructions?: string[];
}

export interface ProgramInfo {
  address: string;
  loader: string;
  loaderVersion: "v1" | "v2" | "v3" | "v4" | "unknown";
  executable: boolean;
  programDataAddress: string | null;
  lastDeployedSlot: number | null;
  bytecodeHash: string | null;
  bytecodeLength: number | null;
  upgradeAuthority: AuthorityHolder;
  upgradeHistory: UpgradeEvent[];
  anchorIdl: AnchorIdlInfo;
}

export interface ExtensionInfo {
  type: string;
  [key: string]: unknown;
}

export interface MintInfo {
  address: string;
  tokenProgram: string;
  decimals: number;
  supply: string;
  mintAuthority: AuthorityHolder;
  freezeAuthority: AuthorityHolder;
  extensions: ExtensionInfo[];
}

export interface AuditReport {
  auditedAt: string;
  rpcEndpoint: string;
  program: ProgramInfo;
  mint: MintInfo;
}
