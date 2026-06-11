#!/usr/bin/env node
import { Connection, PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { NETWORKS } from "./config.js";
import { runCoreChecks, runExtensionChecks, runRegistryCrossCheck, ExtensionReport } from "./checks.js";
import { discoverableExtensions, normalizeExtensionInputs, resolveGraph } from "./resolve.js";
import { renderHuman, renderJson, renderMermaid } from "./report.js";
import { fetchHubState } from "./evm.js";
import "@coral-xyz/anchor";

function parsePubkey(value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    console.error(`error: '${value}' is not a valid base58 public key`);
    process.exit(2);
  }
}

const program = new Command()
  .name("m0-inspect")
  .description(
    "Read-only inspector for M0 Solana deployments.\n" +
      "Given m_ext program IDs, reads on-chain state across portal / earn / m_ext / ext_swap\n" +
      "and reports what is deployed, wired, and missing."
  )
  .version("0.1.0");

program
  .argument("[network]", "network: devnet | mainnet", "devnet")
  .option("-e, --ext <pubkey...>", "m_ext program ID(s) to inspect (repeatable)")
  .option("--discover", "also inspect extensions registered on-chain (ext_swap whitelist + hyperlane metas)")
  .option("--rpc <url>", "RPC endpoint override")
  .option("--eth-rpc <url>", "EVM hub RPC override (Sepolia for devnet)")
  .option("--no-evm", "skip the EVM hub cross-check (index drift, merkle root parity)")
  .option("--json", "machine-readable output")
  .option("--graph", "print a mermaid diagram of the resolved wiring")
  .option("--m-mint <pubkey>", "override $M mint")
  .option("--earn <pubkey>", "override earn program ID")
  .option("--portal <pubkey>", "override portal program ID")
  .option("--ext-swap <pubkey>", "override ext_swap program ID")
  .action(async (network: string, opts) => {
    const base = NETWORKS[network];
    if (!base) {
      console.error(`error: unknown network '${network}' (expected: ${Object.keys(NETWORKS).join(" | ")})`);
      process.exit(2);
    }
    const cfg = { ...base };
    if (opts.mMint) cfg.mMint = parsePubkey(opts.mMint);
    if (opts.earn) cfg.earnProgram = parsePubkey(opts.earn);
    if (opts.portal) cfg.portalProgram = parsePubkey(opts.portal);
    if (opts.extSwap) cfg.extSwapProgram = parsePubkey(opts.extSwap);

    const rpcUrl: string = opts.rpc ?? process.env.RPC_URL ?? cfg.defaultRpc;
    const connection = new Connection(rpcUrl, "confirmed");
    const warnings: string[] = [];

    const rawInputs = (opts.ext ?? []).map(parsePubkey);
    let extIds = await normalizeExtensionInputs(connection, rawInputs, warnings);

    // First resolve: core (+ explicit extensions)
    let graph = await resolveGraph(connection, cfg, extIds, warnings);

    if (opts.discover) {
      const known = new Set(extIds.map((p: PublicKey) => p.toBase58()));
      const discovered = discoverableExtensions(graph.core).filter((p) => !known.has(p.toBase58()));
      if (discovered.length > 0) {
        warnings.push(`discovered ${discovered.length} additional extension(s) from on-chain registries`);
        extIds = [...extIds, ...discovered];
        graph = await resolveGraph(connection, cfg, extIds, warnings);
      }
    }

    if (extIds.length === 0) {
      warnings.push("no extensions given — core checks only (pass --ext <programId> or --discover)");
    }

    if (opts.evm !== false) {
      const ethRpc: string = opts.ethRpc ?? process.env.ETH_RPC_URL ?? cfg.ethRpc;
      try {
        graph.hub = await fetchHubState(ethRpc, cfg.ethMToken, cfg.ethMerkleTreeBuilder);
      } catch (e) {
        warnings.push(`EVM hub unreachable via ${ethRpc} — skipping index-propagation checks: ${(e as Error).message}`);
      }
    }

    const coreFindings = runCoreChecks(graph, cfg);
    const extReports: ExtensionReport[] = graph.extensions.map((e) => runExtensionChecks(graph, cfg, e));
    const registryFindings = opts.discover ? [] : runRegistryCrossCheck(graph, extIds);

    if (opts.json) {
      console.log(renderJson(graph, coreFindings, extReports, registryFindings, warnings));
    } else {
      console.log(renderHuman(graph, coreFindings, extReports, registryFindings, warnings));
      if (opts.graph) {
        console.log("\n" + renderMermaid(graph));
      }
    }

    const fails = [...coreFindings, ...extReports.flatMap((r) => r.findings), ...registryFindings].filter(
      (f) => f.status === "fail"
    ).length;
    process.exit(fails > 0 ? 1 : 0);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error("error:", e instanceof Error ? e.message : e);
  process.exit(2);
});

