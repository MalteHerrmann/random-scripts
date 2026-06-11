import { PublicKey } from "@solana/web3.js";
import { NetworkConfig, globalPda } from "./config.js";
import { impliedLagDays } from "./evm.js";
import { tokenProgramName } from "./token.js";
import {
  ExtensionState,
  Finding,
  Graph,
  Status,
  YieldConfigCrank,
  YieldConfigScaledUi,
} from "./types.js";

const short = (pk: PublicKey | null | undefined) => (pk ? pk.toBase58() : "—");
const hex = (bytes: number[]) => "0x" + Buffer.from(bytes).toString("hex");
const isZeroBytes = (bytes: number[]) => bytes.every((b) => b === 0);

function f(
  id: string,
  subject: string,
  title: string,
  status: Status,
  detail?: { expected?: string; actual?: string; remediation?: string }
): Finding {
  return { id, subject, title, status, ...detail };
}

function check(
  id: string,
  subject: string,
  title: string,
  ok: boolean,
  detail: { expected?: string; actual?: string; remediation?: string; failStatus?: Status }
): Finding {
  return f(id, subject, title, ok ? "ok" : detail.failStatus ?? "fail", ok ? {} : detail);
}

const ageDays = (d: Date | number) => {
  const t = typeof d === "number" ? d * 1000 : d.getTime();
  return (Date.now() - t) / 86_400_000;
};

/* ================================ core checks ================================ */

export function runCoreChecks(graph: Graph, cfg: NetworkConfig): Finding[] {
  const out: Finding[] = [];
  const { core } = graph;
  const sub = "core";

  // --- C1: $M mint ---
  const m = core.mMint;
  if (!m) {
    out.push(f("C1", sub, "$M mint exists", "fail", { expected: short(core.mMintAddress), actual: "account not found" }));
  } else {
    out.push(f("C1", sub, "$M mint exists (Token2022)", "ok"));
    out.push(
      check("C1.b", sub, "$M has ScaledUiAmount with authority = EarnGlobal", m.scaledUiAmount?.authority?.equals(core.earn.globalPda) ?? false, {
        expected: short(core.earn.globalPda),
        actual: m.scaledUiAmount ? short(m.scaledUiAmount.authority) : "extension missing",
      })
    );
    out.push(
      check("C1.c", sub, "$M DefaultAccountState = Frozen", m.defaultAccountState === "frozen", {
        expected: "frozen",
        actual: m.defaultAccountState ?? "extension missing",
      })
    );
    out.push(
      check("C1.d", sub, "$M PermanentDelegate = EarnGlobal", m.permanentDelegate?.equals(core.earn.globalPda) ?? false, {
        expected: short(core.earn.globalPda),
        actual: short(m.permanentDelegate),
      })
    );
    out.push(
      check("C1.e", sub, "$M mint authority = portal authority PDA", m.mintAuthority?.equals(core.portal.authorityPda) ?? false, {
        expected: short(core.portal.authorityPda),
        actual: short(m.mintAuthority),
      })
    );
    out.push(
      check("C1.f", sub, "$M freeze authority = EarnGlobal", m.freezeAuthority?.equals(core.earn.globalPda) ?? false, {
        expected: short(core.earn.globalPda),
        actual: short(m.freezeAuthority),
      })
    );
  }

  // --- C2: earn program ---
  const earn = core.earn;
  out.push(
    check("C2", sub, "earn program deployed & EarnGlobal initialized", earn.program.executable && earn.global !== null, {
      actual: !earn.program.exists
        ? "program missing"
        : !earn.globalExists
          ? "EarnGlobal not initialized"
          : "EarnGlobal exists but is undecodable (older layout than current source?)",
      remediation: "deploy earn + run initialize (solana-m services/cli)",
    })
  );
  if (earn.global) {
    out.push(
      check("C2.b", sub, "EarnGlobal.m_mint = $M mint", earn.global.m_mint.equals(core.mMintAddress), {
        expected: short(core.mMintAddress),
        actual: short(earn.global.m_mint),
      })
    );
    out.push(
      check("C2.c", sub, "EarnGlobal.portal_authority = portal authority PDA", earn.global.portal_authority.equals(core.portal.authorityPda), {
        expected: short(core.portal.authorityPda),
        actual: short(earn.global.portal_authority),
        remediation: "earn update_portal_authority",
      })
    );
    out.push(
      check("C2.d", sub, "EarnGlobal.ext_swap_global_account = SwapGlobal PDA", earn.global.ext_swap_global_account.equals(core.extSwap.globalPda), {
        expected: short(core.extSwap.globalPda),
        actual: short(earn.global.ext_swap_global_account),
      })
    );

    // --- C3: merkle root / propagation ---
    out.push(
      check("C3", sub, "earner merkle root propagated (non-zero)", !isZeroBytes(earn.global.earner_merkle_root), {
        actual: "root is all zeros — no propagate_index with a root has landed",
        remediation: "verify bridge peers + index-bot; root comes from the EVM hub",
      })
    );
    out.push(
      f("C3.b", sub, "current earner merkle root", "info", { actual: hex(earn.global.earner_merkle_root) })
    );
  }
  if (earn.lastActivity) {
    const days = ageDays(earn.lastActivity);
    out.push(
      f("C3.c", sub, "last activity on EarnGlobal", days > cfg.indexStaleAfterSeconds / 86_400 ? "warn" : "info", {
        actual: `${earn.lastActivity.toISOString()} (${days.toFixed(1)}d ago)`,
        remediation: days > cfg.indexStaleAfterSeconds / 86_400 ? "index propagation may be stalled — check index-bot and bridge" : undefined,
      })
    );
  }

  // --- C4: portal ---
  const portal = core.portal;
  out.push(
    check("C4", sub, "portal program deployed & PortalGlobal initialized", portal.program.executable && portal.global !== null, {
      actual: !portal.program.exists
        ? "program missing"
        : !portal.globalExists
          ? "PortalGlobal not initialized"
          : "PortalGlobal exists but is undecodable (older layout than current source?)",
      remediation: "portal initialize(chain_id)",
    })
  );
  if (portal.global) {
    out.push(
      check("C4.b", sub, "PortalGlobal.m_mint = $M mint", portal.global.m_mint.equals(core.mMintAddress), {
        expected: short(core.mMintAddress),
        actual: short(portal.global.m_mint),
      })
    );
    out.push(
      check("C4.c", sub, "portal not paused", !portal.global.incoming_paused && !portal.global.outgoing_paused, {
        actual: `incoming_paused=${portal.global.incoming_paused} outgoing_paused=${portal.global.outgoing_paused}`,
        remediation: "portal unpause_incoming / unpause_outgoing (admin)",
        failStatus: "warn",
      })
    );
    out.push(
      f("C4.d", sub, "portal m_index / chain id", "info", {
        actual: `m_index=${portal.global.m_index.toString()} chain_id=${portal.global.chain_id} isolated_hub=${portal.global.isolated_hub_chain_id ?? "none"}`,
      })
    );
    if (portal.bridgePathsAvailable) {
      const pathCount = portal.bridgePaths.reduce((n, p) => n + p.paths.length, 0);
      out.push(
        check("C4.e", sub, "bridge paths registered", pathCount > 0, {
          actual: `0 paths — send_token will fail with UnsupportedBridgePath`,
          remediation: "portal initialize_bridge_paths + add_bridge_paths per destination chain",
          failStatus: "warn",
        })
      );
      for (const p of portal.bridgePaths) {
        out.push(
          f("C4.f", sub, `bridge paths → chain ${p.destination_chain_id}`, "info", {
            actual: p.paths.map((bp) => `${short(bp.source_mint)} → ${hex(bp.destination_token).slice(0, 24)}…`).join("; ") || "(empty)",
          })
        );
      }
    }
  }

  // --- C5: adapters ---
  const wh = core.wormhole;
  out.push(
    check("C5", sub, "wormhole adapter deployed & initialized", wh.program.executable && wh.global !== null, {
      actual: !wh.program.exists
        ? "program missing"
        : !wh.globalExists
          ? "WormholeGlobal not initialized"
          : "WormholeGlobal exists but is undecodable (older layout than current source?)",
      failStatus: "warn",
    })
  );
  if (wh.global) {
    const peers = wh.global.peers;
    out.push(
      check("C5.b", sub, "wormhole adapter has peers", peers.length > 0, {
        actual: "no peers — send/receive will fail with InvalidPeer",
        remediation: "wormhole-adapter set_peer (runbook: solana-portal/runbooks/set_peers, Squads approval)",
      })
    );
    for (const p of peers) {
      out.push(
        f("C5.c", sub, `wormhole peer (m0 chain ${p.m0_chain_id}, wh chain ${p.adapter_chain_id})`, "info", {
          actual: hex(p.address),
          remediation: "verify this matches the canonical hub adapter — a stale Sepolia peer causes InvalidPeer(6003) on devnet",
        })
      );
    }
    if (wh.global.incoming_paused || wh.global.outgoing_paused) {
      out.push(f("C5.d", sub, "wormhole adapter paused", "warn", { actual: `incoming=${wh.global.incoming_paused} outgoing=${wh.global.outgoing_paused}` }));
    }
  }

  const hl = core.hyperlane;
  out.push(
    check("C5.e", sub, "hyperlane adapter deployed & initialized", hl.program.executable && hl.global !== null, {
      actual: !hl.program.exists
        ? "program missing"
        : !hl.globalExists
          ? "HyperlaneGlobal not initialized"
          : "HyperlaneGlobal exists but is undecodable — deployed adapter likely predates the current source; upgrade it or vendor its old layout",
      failStatus: "warn",
    })
  );
  if (hl.global) {
    const peers = hl.global.peers;
    out.push(
      check("C5.f", sub, "hyperlane adapter has peers", peers.length > 0, {
        actual: "no peers registered",
        remediation: "hyperlane-adapter set_peer",
        failStatus: "warn",
      })
    );
    for (const p of peers) {
      out.push(f("C5.g", sub, `hyperlane peer (m0 chain ${p.m0_chain_id}, domain ${p.adapter_chain_id})`, "info", { actual: hex(p.address) }));
    }
    // --- C6: hyperlane wiring ---
    out.push(
      check("C6", sub, "hyperlane ISM configured", hl.global.ism !== null, {
        actual: "no ISM — incoming messages cannot be verified",
        remediation: "hyperlane-adapter set_ism",
        failStatus: "warn",
      })
    );
    if (hl.accountMetas && core.extSwap.global) {
      const metas = new Set(hl.accountMetas.extensions.map((e) => `${e.program_id.toBase58()}:${e.mint.toBase58()}`));
      const wl = new Set(core.extSwap.global.whitelisted_extensions.map((e) => `${e.program_id.toBase58()}:${e.mint.toBase58()}`));
      const missing = [...wl].filter((k) => !metas.has(k));
      const stale = [...metas].filter((k) => !wl.has(k));
      out.push(
        check("C6.b", sub, "hyperlane AccountMetasData in sync with ext_swap whitelist", missing.length === 0 && stale.length === 0, {
          actual: `missing from metas: [${missing.join(", ") || "none"}]; stale in metas: [${stale.join(", ") || "none"}]`,
          remediation: "hyperlane-adapter sync_extensions",
          failStatus: "warn",
        })
      );
      out.push(
        check("C6.c", sub, "hyperlane AccountMetasData.m_mint = $M mint", hl.accountMetas.m_mint.equals(core.mMintAddress), {
          expected: short(core.mMintAddress),
          actual: short(hl.accountMetas.m_mint),
        })
      );
    }
  }

  // --- ext_swap ---
  const swap = core.extSwap;
  out.push(
    check("C8", sub, "ext_swap deployed & SwapGlobal initialized", swap.program.executable && swap.global !== null, {
      actual: !swap.program.exists
        ? "program missing"
        : !swap.globalExists
          ? "SwapGlobal not initialized"
          : "SwapGlobal exists but is undecodable (older layout than current source?)",
      remediation: "ext_swap initialize (solana-m-extensions cli: initialize-ext-swap)",
    })
  );
  if (swap.global) {
    out.push(
      f("C8.b", sub, "ext_swap admin / whitelist size", "info", {
        actual: `admin=${short(swap.global.admin)} extensions=${swap.global.whitelisted_extensions.length} unwrappers=${swap.global.whitelisted_unwrappers.length}`,
      })
    );
  }

  // --- C9: index propagation vs the EVM hub (source of truth) ---
  const hub = graph.hub;
  if (hub) {
    out.push(
      f("C9", sub, "EVM hub state ($M.currentIndex on " + (cfg.name === "devnet" ? "Sepolia" : "Ethereum") + ")", "info", {
        actual: `index=${hub.index} (multiplier ${(Number(hub.index) / 1e12).toFixed(9)})${
          hub.earnerRateBps !== null ? `, earner rate ${hub.earnerRateBps} bps` : ""
        }`,
      })
    );

    // what earners on Solana actually see is the mint's ScaledUiAmount multiplier
    const solIndex = m?.scaledUiAmount ? BigInt(Math.round(m.scaledUiAmount.newMultiplier * 1e12)) : null;
    if (solIndex !== null) {
      const driftBps = (Number(hub.index - solIndex) / Number(hub.index)) * 10_000;
      const lagDays = hub.earnerRateBps !== null ? impliedLagDays(hub.index, solIndex, hub.earnerRateBps) : null;
      const stale = lagDays !== null ? lagDays > cfg.indexStaleAfterSeconds / 86_400 : driftBps > 10;
      out.push(
        check("C9.b", sub, "Solana $M index in sync with hub", !stale, {
          expected: `hub index ${hub.index}`,
          actual: `solana multiplier ${(Number(solIndex) / 1e12).toFixed(9)} — behind by ${driftBps.toFixed(2)} bps${
            lagDays !== null ? ` (≈ ${lagDays.toFixed(1)} days at ${hub.earnerRateBps} bps)` : ""
          }`,
          remediation: "push the index: solana-m index-bot (pnpm start -- index push) / verify bridge peers",
          failStatus: "warn",
        })
      );
      if (!stale) {
        // still show the measured lag on the ok path
        out.push(
          f("C9.c", sub, "index propagation lag", "info", {
            actual: `${driftBps.toFixed(2)} bps behind hub${lagDays !== null ? ` ≈ ${lagDays.toFixed(1)} days` : ""}`,
          })
        );
      }
    }

    // portal.m_index should match the mint multiplier (both updated by propagate_index)
    if (portal.global && solIndex !== null) {
      const diff = portal.global.m_index > solIndex ? portal.global.m_index - solIndex : solIndex - portal.global.m_index;
      out.push(
        check("C9.d", sub, "PortalGlobal.m_index consistent with $M multiplier", diff <= 1n, {
          expected: solIndex.toString(),
          actual: portal.global.m_index.toString(),
          failStatus: "warn",
        })
      );
    }

    // merkle root parity with the hub's tree builder
    if (earn.global) {
      const solRoot = hex(earn.global.earner_merkle_root);
      out.push(
        check("C9.e", sub, "earner merkle root matches hub tree builder", solRoot.toLowerCase() === hub.earnerMerkleRoot.toLowerCase(), {
          expected: hub.earnerMerkleRoot,
          actual: solRoot,
          remediation: "root updated on the hub but not yet bridged — run index-bot / check wormhole peer config",
          failStatus: "warn",
        })
      );
    }
  }

  // --- C7: index freshness on the mint itself ---
  if (m?.scaledUiAmount) {
    const s = m.scaledUiAmount;
    out.push(
      check("C7", sub, "$M multiplier sane (≥ 1.0)", s.multiplier >= 1 && s.newMultiplier >= 1, {
        actual: `multiplier=${s.multiplier} new=${s.newMultiplier}`,
      })
    );
    const days = ageDays(s.newMultiplierEffectiveTimestamp);
    out.push(
      f("C7.b", sub, "$M multiplier last updated", days > cfg.indexStaleAfterSeconds / 86_400 ? "warn" : "info", {
        actual: `${new Date(s.newMultiplierEffectiveTimestamp * 1000).toISOString()} (${days.toFixed(1)}d ago), multiplier=${s.newMultiplier}`,
        remediation: days > cfg.indexStaleAfterSeconds / 86_400 ? "index propagation stalled — check index-bot / bridge peers" : undefined,
      })
    );
  }

  return out;
}

/* ============================== extension checks ============================== */

export interface ExtensionReport {
  ext: ExtensionState;
  findings: Finding[];
  tiers: { name: string; achieved: boolean }[];
}

export function runExtensionChecks(graph: Graph, cfg: NetworkConfig, ext: ExtensionState): ExtensionReport {
  const out: Finding[] = [];
  const { core } = graph;
  const name = ext.label ?? ext.programId.toBase58().slice(0, 8) + "…";
  const sub = `ext:${name}`;
  const legacyEarnGlobal = globalPda(cfg.legacyEarnProgram);

  // E1 deployed
  out.push(
    check("E1", sub, "program deployed & executable", ext.program.executable, {
      actual: ext.program.exists ? "account exists but not executable" : "program account not found",
      remediation: `solana-m-extensions: pnpm deploy:dev deploy-program --type <variant> --extension ${name}`,
    })
  );
  if (ext.program.upgradeAuthority) {
    out.push(f("E1.b", sub, "upgrade authority", "info", { actual: short(ext.program.upgradeAuthority) }));
  }

  // E2 initialized + variant
  out.push(
    check("E2", sub, "ExtGlobalV2 initialized", ext.global !== null, {
      actual: ext.globalExists
        ? `global PDA ${short(ext.globalPda)} exists but matched no known ExtGlobalV2 layout generation`
        : `global PDA ${short(ext.globalPda)} not found`,
      remediation: ext.globalExists
        ? "deployed program predates known layouts — inspect manually / add the layout to the inspector"
        : "run m_ext.initialize (no CLI command — see Notion runbook 'Solana Extension initialization and swap', step 7)",
    })
  );

  const tiers: ExtensionReport["tiers"] = [];
  const g = ext.global;
  let swappable = false;
  let bridgeable = false;

  if (g) {
    out.push(
      f("E2.b", sub, "variant / admin", "info", {
        actual: `variant=${ext.variant} admin=${short(g.admin)} wrap_authorities=${g.wrap_authorities.length}${ext.layoutNote ? ` — ${ext.layoutNote}` : ""}`,
      })
    );

    // E3 core refs
    out.push(
      check("E3", sub, "m_mint = canonical $M", g.m_mint.equals(core.mMintAddress), {
        expected: short(core.mMintAddress),
        actual: short(g.m_mint),
      })
    );
    const earnRefOk = g.m_earn_global_account.equals(core.earn.globalPda);
    const isLegacy = g.m_earn_global_account.equals(legacyEarnGlobal);
    out.push(
      check("E3.b", sub, "m_earn_global_account = canonical EarnGlobal", earnRefOk, {
        expected: short(core.earn.globalPda),
        actual: short(g.m_earn_global_account) + (isLegacy ? " (LEGACY earn program global — stale docs reference this!)" : ""),
      })
    );

    // E4 ext mint
    if (!ext.extMint) {
      out.push(
        f("E4", sub, "ext mint exists", "fail", {
          expected: short(g.ext_mint),
          actual: "mint account not found",
          remediation: "create-ext-mint (solana-m-extensions cli)",
        })
      );
    } else {
      out.push(f("E4", sub, `ext mint exists (${tokenProgramName(ext.extMint.tokenProgram)})`, "ok"));
      out.push(
        check("E4.b", sub, "ext mint authority = mint_authority PDA", ext.extMint.mintAuthority?.equals(ext.extMintAuthorityPda) ?? false, {
          expected: short(ext.extMintAuthorityPda),
          actual: short(ext.extMint.mintAuthority),
        })
      );
      if (ext.variant === "scaled-ui") {
        out.push(
          check("E4.c", sub, "scaled-ui ext mint has ScaledUiAmount (authority = mint_authority PDA)", ext.extMint.scaledUiAmount?.authority?.equals(ext.extMintAuthorityPda) ?? false, {
            expected: short(ext.extMintAuthorityPda),
            actual: ext.extMint.scaledUiAmount ? short(ext.extMint.scaledUiAmount.authority) : "ScaledUiAmount extension missing",
          })
        );
      }
    }

    // E5 / E6 vault ATA
    out.push(
      check("E5", sub, "m_vault $M ATA exists", ext.vaultAtaState !== "missing", {
        expected: short(ext.vaultMAta),
        actual: "ATA not created",
        remediation: "create-vault-m-ata (solana-m-extensions cli)",
      })
    );
    if (ext.vaultAtaState !== "missing") {
      out.push(
        check("E6", sub, "m_vault ATA thawed (registered earner)", ext.vaultAtaState === "initialized", {
          actual: "ATA is FROZEN — m_vault is not a registered earner",
          remediation: `EVM-side: add m_vault ${short(ext.mVaultPda)} to earner merkle tree; then solana-m: pnpm cli:dev add-registrar-earner ${ext.programId.toBase58()} --extension`,
        })
      );
    }

    // E7 wrap authorities
    const hasSwapAuthority = g.wrap_authorities.some((a) => a.equals(core.extSwap.globalPda));
    out.push(
      check("E7", sub, "wrap_authorities include SwapGlobal PDA", hasSwapAuthority, {
        expected: short(core.extSwap.globalPda),
        actual: g.wrap_authorities.map((a) => short(a)).join(", ") || "(empty)",
        remediation: `add-wrap-authority -e ${name} ${core.extSwap.globalPda.toBase58()}`,
        failStatus: "warn",
      })
    );
    const hasPortalAuthority = g.wrap_authorities.some((a) => a.equals(core.portal.authorityPda));
    out.push(
      f("E7.b", sub, "wrap_authorities include portal authority (direct bridge wrap)", hasPortalAuthority ? "ok" : "info", {
        actual: hasPortalAuthority ? undefined : "portal authority not a wrap authority — inbound bridge delivery relies on ext_swap routing",
      })
    );

    // E8 swap whitelist
    const wlEntry = core.extSwap.global?.whitelisted_extensions.find((e) => e.program_id.equals(ext.programId));
    out.push(
      check("E8", sub, "whitelisted in ext_swap", wlEntry !== undefined, {
        actual: "not in SwapGlobal.whitelisted_extensions",
        remediation: `whitelist-extensions (requires ext_swap admin ${short(core.extSwap.global?.admin)})`,
        failStatus: "warn",
      })
    );
    if (wlEntry && ext.extMint) {
      out.push(
        check("E8.b", sub, "whitelist entry matches ext mint + token program", wlEntry.mint.equals(g.ext_mint) && wlEntry.token_program.equals(ext.extMint.tokenProgram), {
          expected: `${short(g.ext_mint)} / ${tokenProgramName(ext.extMint.tokenProgram)}`,
          actual: `${short(wlEntry.mint)} / ${tokenProgramName(wlEntry.token_program)}`,
        })
      );
    }
    swappable = hasSwapAuthority && wlEntry !== undefined;

    // E9 yield config per variant
    if (ext.variant === "crank") {
      const yc = g.yield_config as YieldConfigCrank;
      const tsDays = yc.timestamp > 0n ? ageDays(Number(yc.timestamp)) : null;
      out.push(
        check("E9", sub, "crank earn_authority set", !yc.earn_authority.equals(PublicKey.default), {
          actual: "earn_authority is the zero address — claim_for cannot run",
          remediation: "set_earn_authority (admin)",
        })
      );
      out.push(
        f("E9.b", sub, "crank yield sync", tsDays !== null && tsDays > cfg.indexStaleAfterSeconds / 86_400 ? "warn" : "info", {
          actual: `last_m_index=${yc.last_m_index.toString()} last_ext_index=${yc.last_ext_index.toString()} synced=${
            tsDays === null ? "never" : `${tsDays.toFixed(1)}d ago`
          }`,
          remediation: tsDays !== null && tsDays > cfg.indexStaleAfterSeconds / 86_400 ? "yield-bot may be stalled (sync/claim_for)" : undefined,
        })
      );
    } else if (ext.variant === "scaled-ui") {
      const yc = g.yield_config as YieldConfigScaledUi;
      const portalIndex = core.portal.global?.m_index;
      const lagging = portalIndex !== undefined ? portalIndex > yc.last_m_index : false;
      out.push(
        f("E9", sub, "scaled-ui yield config", lagging ? "warn" : "info", {
          actual: `fee_bps=${yc.fee_bps.toString()} last_m_index=${yc.last_m_index.toString()} last_ext_index=${yc.last_ext_index.toString()}${
            lagging ? ` — lags portal m_index ${portalIndex!.toString()}` : ""
          }`,
          remediation: lagging ? "call sync on the extension to pull the latest index" : undefined,
        })
      );
    }

    // E10 bridge path (only meaningful if enumeration worked)
    if (core.portal.bridgePathsAvailable) {
      const hasPath = core.portal.bridgePaths.some((cp) => cp.paths.some((p) => p.source_mint.equals(g.ext_mint)));
      out.push(
        f("E10", sub, "bridge path registered for ext mint", hasPath ? "ok" : "info", {
          actual: hasPath ? undefined : "no ChainBridgePaths entry — outbound bridging of this extension unavailable",
          remediation: hasPath ? undefined : "portal add_bridge_paths(dest_chain, {source_mint: ext_mint, destination_token})",
        })
      );
      const inMetas = core.hyperlane.accountMetas?.extensions.some((e) => e.program_id.equals(ext.programId)) ?? false;
      out.push(
        f("E10.b", sub, "in hyperlane AccountMetasData", inMetas ? "ok" : "info", {
          actual: inMetas ? undefined : "not in hyperlane account metas — inbound hyperlane delivery as this ext unavailable",
          remediation: inMetas ? undefined : "hyperlane-adapter sync_extensions (after ext_swap whitelisting)",
        })
      );
      bridgeable = swappable && core.portal.bridgePaths.some((cp) => cp.paths.some((p) => p.source_mint.equals(g.ext_mint)));
    }

    // E11 collateralization (UI terms: vault M ui balance vs ext ui supply)
    if (ext.extMint && ext.vaultMUiBalance !== null) {
      const extMultiplier = ext.extMint.scaledUiAmount?.multiplier ?? 1;
      const extUiSupply = (Number(ext.extMint.supply) / 10 ** ext.extMint.decimals) * extMultiplier;
      // small epsilon for float artifacts
      const ok = ext.vaultMUiBalance >= extUiSupply - 1e-6 * Math.max(1, extUiSupply);
      out.push(
        check("E11", sub, "vault $M covers ext supply", ok, {
          expected: `vault ≥ ${extUiSupply.toFixed(6)} (ext UI supply)`,
          actual: `vault $M (UI) = ${ext.vaultMUiBalance.toFixed(6)}`,
          failStatus: "warn",
        })
      );
      out.push(
        f("E11.b", sub, "balances", "info", {
          actual: `ext supply (UI) = ${extUiSupply.toFixed(6)}, vault $M (UI) = ${ext.vaultMUiBalance.toFixed(6)}`,
        })
      );
    }
  }

  const initialized = g !== null && ext.extMint !== null && ext.vaultAtaState !== "missing";
  tiers.push(
    { name: "deployed", achieved: ext.program.executable },
    { name: "initialized", achieved: initialized },
    { name: "earner", achieved: ext.vaultAtaState === "initialized" },
    { name: "swappable", achieved: swappable },
    { name: "bridgeable", achieved: bridgeable }
  );

  return { ext, findings: out, tiers };
}

/* ====== discovery cross-check: registered on-chain but not in the input list ====== */

export function runRegistryCrossCheck(graph: Graph, inputs: PublicKey[]): Finding[] {
  const out: Finding[] = [];
  const inputSet = new Set(inputs.map((p) => p.toBase58()));
  for (const e of graph.core.extSwap.global?.whitelisted_extensions ?? []) {
    if (!inputSet.has(e.program_id.toBase58())) {
      out.push(
        f("D1", "registry", `ext_swap whitelists ${e.program_id.toBase58()} — not in your input list`, "warn", {
          actual: `mint ${e.mint.toBase58()}`,
          remediation: "re-run including this program ID, or use --discover",
        })
      );
    }
  }
  return out;
}
