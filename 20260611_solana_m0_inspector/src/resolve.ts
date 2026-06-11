import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import {
  NetworkConfig,
  extMintAuthorityPda,
  globalPda,
  hyperlaneAccountMetasPda,
  mVaultPda,
  portalAuthorityPda,
} from "./config.js";
import {
  DISCRIMINATORS,
  decodeAccountMetasData,
  decodeChainBridgePaths,
  decodeEarnGlobal,
  decodeExtGlobalV2,
  decodeHyperlaneGlobal,
  decodePortalGlobal,
  decodeSwapGlobal,
  decodeWormholeGlobal,
  matchDiscriminator,
} from "./decode.js";
import { decodeMint, decodeTokenAccountState, uiAmount } from "./token.js";
import {
  AccountMetasData,
  ChainBridgePaths,
  CoreState,
  EarnGlobal,
  ExtGlobalV2,
  ExtensionState,
  Graph,
  HyperlaneGlobal,
  PortalGlobal,
  ProgramInfo,
  SwapGlobal,
  Variant,
  WormholeGlobal,
} from "./types.js";

const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/** Batched getMultipleAccountsInfo keyed by base58, deduplicated. */
async function fetchAccounts(
  connection: Connection,
  keys: PublicKey[]
): Promise<Map<string, AccountInfo<Buffer> | null>> {
  const unique = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
  const out = new Map<string, AccountInfo<Buffer> | null>();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk);
    chunk.forEach((k, j) => out.set(k.toBase58(), infos[j] ?? null));
  }
  return out;
}

function programInfo(
  programId: PublicKey,
  info: AccountInfo<Buffer> | null,
  programDataInfo: AccountInfo<Buffer> | null
): ProgramInfo {
  const exists = info !== null;
  const executable = info?.executable ?? false;
  let upgradeAuthority: PublicKey | null = null;
  // ProgramData layout: u32 enum tag (3) | u64 slot | Option<Pubkey> upgrade authority
  if (programDataInfo && programDataInfo.data.length >= 45 && programDataInfo.data.readUInt32LE(0) === 3) {
    if (programDataInfo.data[12] === 1) {
      upgradeAuthority = new PublicKey(programDataInfo.data.subarray(13, 45));
    }
  }
  return { programId, exists, executable, upgradeAuthority };
}

/** Program account layout: u32 enum tag (2) | Pubkey programdata address */
function programDataAddress(info: AccountInfo<Buffer> | null): PublicKey | null {
  if (!info || !info.executable || !info.owner.equals(BPF_UPGRADEABLE_LOADER)) return null;
  if (info.data.length < 36 || info.data.readUInt32LE(0) !== 2) return null;
  return new PublicKey(info.data.subarray(4, 36));
}

function decodeOrNull<T>(decode: () => T, label: string, warnings: string[]): T | null {
  try {
    return decode();
  } catch (e) {
    warnings.push(`failed to decode ${label}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Normalize a user-supplied "extension" pubkey to an m_ext program ID.
 * Accepts the program ID itself, or its global PDA (recovered via the
 * account's owner), so pasting the wrong column from a spreadsheet still works.
 */
export async function normalizeExtensionInputs(
  connection: Connection,
  inputs: PublicKey[],
  warnings: string[]
): Promise<PublicKey[]> {
  const infos = await fetchAccounts(connection, inputs);
  const out: PublicKey[] = [];
  for (const input of inputs) {
    const info = infos.get(input.toBase58()) ?? null;
    if (info && !info.executable) {
      const kind = matchDiscriminator(info.data);
      if (kind === "ExtGlobalV2") {
        warnings.push(`${input.toBase58()} is an ExtGlobalV2 account; using its owner program ${info.owner.toBase58()}`);
        out.push(info.owner);
        continue;
      }
      if (kind !== null) {
        warnings.push(`${input.toBase58()} is a ${kind} account, not an m_ext program — skipping`);
        continue;
      }
    }
    out.push(input); // program, missing account, or unknown: treated as program ID downstream
  }
  return out;
}

/** Pull extension program IDs registered on-chain (ext_swap whitelist + hyperlane metas). */
export function discoverableExtensions(core: CoreState): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const e of core.extSwap.global?.whitelisted_extensions ?? []) {
    seen.set(e.program_id.toBase58(), e.program_id);
  }
  for (const e of core.hyperlane.accountMetas?.extensions ?? []) {
    seen.set(e.program_id.toBase58(), e.program_id);
  }
  return [...seen.values()];
}

export async function resolveGraph(
  connection: Connection,
  cfg: NetworkConfig,
  extProgramIds: PublicKey[],
  warnings: string[]
): Promise<Graph> {
  const earnGlobalPda = globalPda(cfg.earnProgram);
  const portalGlobalPda = globalPda(cfg.portalProgram);
  const wormholeGlobalPda = globalPda(cfg.wormholeAdapterProgram);
  const hyperlaneGlobalPda = globalPda(cfg.hyperlaneAdapterProgram);
  const hyperlaneMetasPda = hyperlaneAccountMetasPda(cfg.hyperlaneAdapterProgram);
  const extSwapGlobalPda = globalPda(cfg.extSwapProgram);
  const portalAuthority = portalAuthorityPda(cfg.portalProgram);

  const extDerived = extProgramIds.map((programId) => ({
    programId,
    globalPda: globalPda(programId),
    mVaultPda: mVaultPda(programId),
    extMintAuthorityPda: extMintAuthorityPda(programId),
  }));

  // ---- round 1: programs + globals + M mint ----
  const round1Keys = [
    cfg.mMint,
    cfg.earnProgram,
    cfg.portalProgram,
    cfg.wormholeAdapterProgram,
    cfg.hyperlaneAdapterProgram,
    cfg.extSwapProgram,
    earnGlobalPda,
    portalGlobalPda,
    wormholeGlobalPda,
    hyperlaneGlobalPda,
    hyperlaneMetasPda,
    extSwapGlobalPda,
    ...extDerived.flatMap((e) => [e.programId, e.globalPda]),
  ];
  if (process.env.M0_DEBUG) console.error("[debug] before-r1");
  const r1 = await fetchAccounts(connection, round1Keys);
  const get = (k: PublicKey) => r1.get(k.toBase58()) ?? null;

  if (process.env.M0_DEBUG) console.error("[debug] after-r1");
  const mMintInfo = get(cfg.mMint);
  const mMint = mMintInfo ? decodeOrNull(() => decodeMint(cfg.mMint, mMintInfo), "$M mint", warnings) : null;

  const earnGlobalInfo = get(earnGlobalPda);
  const earnGlobal = earnGlobalInfo
    ? decodeOrNull<EarnGlobal>(() => decodeEarnGlobal(earnGlobalInfo.data), "EarnGlobal", warnings)
    : null;

  const portalGlobalInfo = get(portalGlobalPda);
  const portalGlobal = portalGlobalInfo
    ? decodeOrNull<PortalGlobal>(
        () => decodePortalGlobal(portalGlobalInfo.data),
        "PortalGlobal",
        warnings
      )
    : null;

  const wormholeGlobalInfo = get(wormholeGlobalPda);
  const wormholeGlobal = wormholeGlobalInfo
    ? decodeOrNull<WormholeGlobal>(
        () => decodeWormholeGlobal(wormholeGlobalInfo.data),
        "WormholeGlobal",
        warnings
      )
    : null;

  const hyperlaneGlobalInfo = get(hyperlaneGlobalPda);
  const hyperlaneGlobal = hyperlaneGlobalInfo
    ? decodeOrNull<HyperlaneGlobal>(
        () => decodeHyperlaneGlobal(hyperlaneGlobalInfo.data),
        "HyperlaneGlobal",
        warnings
      )
    : null;

  const hyperlaneMetasInfo = get(hyperlaneMetasPda);
  const hyperlaneMetas = hyperlaneMetasInfo
    ? decodeOrNull<AccountMetasData>(
        () => decodeAccountMetasData(hyperlaneMetasInfo.data),
        "AccountMetasData",
        warnings
      )
    : null;

  const swapGlobalInfo = get(extSwapGlobalPda);
  const swapGlobal = swapGlobalInfo
    ? decodeOrNull<SwapGlobal>(
        () => decodeSwapGlobal(swapGlobalInfo.data),
        "SwapGlobal",
        warnings
      )
    : null;

  // decode extension globals (layout-generation aware, detects the variant)
  const extDecoded = extDerived.map((e) => {
    const programAccount = get(e.programId);
    const globalInfo = get(e.globalPda);
    let global: ExtGlobalV2 | null = null;
    let variant: Variant | null = null;
    let layoutNote: string | null = null;
    if (globalInfo) {
      if (matchDiscriminator(globalInfo.data) !== "ExtGlobalV2") {
        warnings.push(`${e.globalPda.toBase58()} (global of ${e.programId.toBase58()}) is not an ExtGlobalV2 account`);
      } else {
        const decoded = decodeExtGlobalV2(globalInfo.data);
        if (decoded) {
          global = decoded.global;
          variant = decoded.variant;
          layoutNote = decoded.layoutNote;
        } else {
          warnings.push(`ExtGlobalV2 of ${e.programId.toBase58()} matched no known layout generation`);
        }
      }
    }
    return { ...e, programAccount, globalExists: globalInfo !== null, global, variant, layoutNote };
  });

  // ---- round 2: programdata, ext mints, vault ATAs ----
  const round2Keys: PublicKey[] = [];
  const programDataAddrs = new Map<string, PublicKey>();
  for (const pid of [
    cfg.earnProgram,
    cfg.portalProgram,
    cfg.wormholeAdapterProgram,
    cfg.hyperlaneAdapterProgram,
    cfg.extSwapProgram,
    ...extDerived.map((e) => e.programId),
  ]) {
    const pda = programDataAddress(get(pid));
    if (pda) {
      programDataAddrs.set(pid.toBase58(), pda);
      round2Keys.push(pda);
    }
  }
  const vaultAtas = extDecoded.map((e) =>
    getAssociatedTokenAddressSync(cfg.mMint, e.mVaultPda, true, TOKEN_2022_PROGRAM_ID)
  );
  round2Keys.push(...vaultAtas);
  for (const e of extDecoded) if (e.global) round2Keys.push(e.global.ext_mint);

  if (process.env.M0_DEBUG) console.error("[debug] before-r2");
  const r2 = await fetchAccounts(connection, round2Keys);
  const get2 = (k: PublicKey) => r2.get(k.toBase58()) ?? null;
  const pInfo = (pid: PublicKey, account: AccountInfo<Buffer> | null) => {
    const pdAddr = programDataAddrs.get(pid.toBase58());
    return programInfo(pid, account, pdAddr ? get2(pdAddr) : null);
  };

  if (process.env.M0_DEBUG) console.error("[debug] after-r2");
  // ---- earn global activity (index/root propagation heartbeat) ----
  let lastActivity: Date | null = null;
  try {
    const sigs = await connection.getSignaturesForAddress(earnGlobalPda, { limit: 1 });
    if (sigs.length > 0 && sigs[0].blockTime) lastActivity = new Date(sigs[0].blockTime * 1000);
  } catch (e) {
    warnings.push(`could not fetch earn global activity: ${(e as Error).message}`);
  }

  // ---- bridge paths (getProgramAccounts may be disabled on public RPCs) ----
  if (process.env.M0_DEBUG) console.error("[debug] after-signatures");
  let bridgePaths: ChainBridgePaths[] = [];
  let bridgePathsAvailable = true;
  try {
    const accounts = await connection.getProgramAccounts(cfg.portalProgram, {
      filters: [{ memcmp: { offset: 0, bytes: bs58.encode(DISCRIMINATORS["ChainBridgePaths"]) } }],
    });
    bridgePaths = accounts
      .map((a) =>
        decodeOrNull<ChainBridgePaths>(
          () => decodeChainBridgePaths(a.account.data),
          `ChainBridgePaths ${a.pubkey.toBase58()}`,
          warnings
        )
      )
      .filter((p): p is ChainBridgePaths => p !== null);
  } catch (e) {
    bridgePathsAvailable = false;
    warnings.push(`getProgramAccounts unavailable, skipping bridge-path enumeration: ${(e as Error).message}`);
  }

  if (process.env.M0_DEBUG) console.error("[debug] after-gpa");
  const core: CoreState = {
    mMint,
    mMintAddress: cfg.mMint,
    earn: {
      program: pInfo(cfg.earnProgram, get(cfg.earnProgram)),
      globalPda: earnGlobalPda,
      globalExists: earnGlobalInfo !== null,
      global: earnGlobal,
      lastActivity,
    },
    portal: {
      program: pInfo(cfg.portalProgram, get(cfg.portalProgram)),
      globalPda: portalGlobalPda,
      globalExists: portalGlobalInfo !== null,
      authorityPda: portalAuthority,
      global: portalGlobal,
      bridgePaths,
      bridgePathsAvailable,
    },
    wormhole: {
      program: pInfo(cfg.wormholeAdapterProgram, get(cfg.wormholeAdapterProgram)),
      globalPda: wormholeGlobalPda,
      globalExists: wormholeGlobalInfo !== null,
      global: wormholeGlobal,
    },
    hyperlane: {
      program: pInfo(cfg.hyperlaneAdapterProgram, get(cfg.hyperlaneAdapterProgram)),
      globalPda: hyperlaneGlobalPda,
      globalExists: hyperlaneGlobalInfo !== null,
      global: hyperlaneGlobal,
      accountMetasPda: hyperlaneMetasPda,
      accountMetas: hyperlaneMetas,
    },
    extSwap: {
      program: pInfo(cfg.extSwapProgram, get(cfg.extSwapProgram)),
      globalPda: extSwapGlobalPda,
      globalExists: swapGlobalInfo !== null,
      global: swapGlobal,
    },
  };

  const extensions: ExtensionState[] = extDecoded.map((e, i) => {
    const vaultAta = vaultAtas[i];
    const vault = decodeTokenAccountState(vaultAta, get2(vaultAta));
    const extMintInfo = e.global ? get2(e.global.ext_mint) : null;
    const extMint =
      e.global && extMintInfo
        ? decodeOrNull(() => decodeMint(e.global!.ext_mint, extMintInfo), `ext mint of ${e.programId.toBase58()}`, warnings)
        : null;
    const mMultiplier = mMint?.scaledUiAmount?.multiplier ?? 1;
    return {
      programId: e.programId,
      program: pInfo(e.programId, e.programAccount),
      globalPda: e.globalPda,
      globalExists: e.globalExists,
      global: e.global,
      variant: e.variant,
      layoutNote: e.layoutNote,
      extMint,
      mVaultPda: e.mVaultPda,
      extMintAuthorityPda: e.extMintAuthorityPda,
      vaultMAta: vaultAta,
      vaultAtaState: vault.state,
      vaultMUiBalance: mMint ? uiAmount(vault.amount, mMint.decimals, mMultiplier) : null,
      label: cfg.knownExtensions[e.programId.toBase58()] ?? null,
    };
  });

  return {
    network: cfg.name,
    rpcUrl: (connection as unknown as { _rpcEndpoint: string })._rpcEndpoint,
    fetchedAt: new Date(),
    core,
    extensions,
    hub: null,
  };
}
