import { ExtensionReport } from "./checks.js";
import { Finding, Graph, Status } from "./types.js";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const useColor = process.stdout.isTTY ?? false;
const paint = (code: string, s: string) => (useColor ? code + s + C.reset : s);

const ICON: Record<Status, string> = { ok: "✅", warn: "⚠️ ", fail: "❌", info: "ℹ️ " };
const COLOR: Record<Status, string> = { ok: C.green, warn: C.yellow, fail: C.red, info: C.dim };

function renderFinding(fd: Finding, indent = "  "): string {
  const lines: string[] = [];
  const head = `${indent}${ICON[fd.status]} ${paint(COLOR[fd.status], `[${fd.id}] ${fd.title}`)}`;
  lines.push(head);
  const detailIndent = indent + "     ";
  if (fd.status !== "ok") {
    if (fd.expected) lines.push(`${detailIndent}${paint(C.dim, `expected: ${fd.expected}`)}`);
    if (fd.actual) lines.push(`${detailIndent}${paint(C.dim, `actual:   ${fd.actual}`)}`);
    if (fd.remediation && fd.status !== "info") lines.push(`${detailIndent}${paint(C.cyan, `fix: ${fd.remediation}`)}`);
  }
  return lines.join("\n");
}

export function renderHuman(
  graph: Graph,
  coreFindings: Finding[],
  extReports: ExtensionReport[],
  registryFindings: Finding[],
  warnings: string[]
): string {
  const out: string[] = [];
  out.push(paint(C.bold, `M0 Solana deployment report — ${graph.network}`));
  out.push(paint(C.dim, `rpc: ${graph.rpcUrl}`));
  out.push(paint(C.dim, `fetched: ${graph.fetchedAt.toISOString()}`));
  out.push("");

  out.push(paint(C.bold, "── Core (M mint / earn / portal / adapters / ext_swap) ──"));
  for (const fd of coreFindings) out.push(renderFinding(fd));
  out.push("");

  for (const r of extReports) {
    const label = r.ext.label ? `${r.ext.label} (${r.ext.programId.toBase58()})` : r.ext.programId.toBase58();
    const variant = r.ext.variant ? ` [${r.ext.variant}]` : "";
    out.push(paint(C.bold, `── Extension: ${label}${variant} ──`));
    const tierLine = r.tiers
      .map((t) => `${t.name} ${t.achieved ? paint(C.green, "✔") : paint(C.red, "✘")}`)
      .join("  ");
    out.push(`  ${tierLine}`);
    out.push(paint(C.dim, `  global=${r.ext.globalPda.toBase58()} m_vault=${r.ext.mVaultPda.toBase58()} vault_ata=${r.ext.vaultMAta.toBase58()}`));
    if (r.ext.global) out.push(paint(C.dim, `  admin=${r.ext.global.admin.toBase58()}`));
    for (const fd of r.findings) out.push(renderFinding(fd));
    out.push("");
  }

  if (registryFindings.length > 0) {
    out.push(paint(C.bold, "── On-chain registry cross-check ──"));
    for (const fd of registryFindings) out.push(renderFinding(fd));
    out.push("");
  }

  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.length > 0) {
    out.push(paint(C.bold, "── Tool warnings ──"));
    for (const w of uniqueWarnings) out.push(`  ${paint(C.yellow, w)}`);
    out.push("");
  }

  const all = [...coreFindings, ...extReports.flatMap((r) => r.findings), ...registryFindings];
  const fails = all.filter((fd) => fd.status === "fail").length;
  const warns = all.filter((fd) => fd.status === "warn").length;
  const oks = all.filter((fd) => fd.status === "ok").length;
  out.push(paint(C.bold, `Summary: ${oks} ok · ${warns} warnings · ${fails} failures`));
  return out.join("\n");
}

export function renderJson(
  graph: Graph,
  coreFindings: Finding[],
  extReports: ExtensionReport[],
  registryFindings: Finding[],
  warnings: string[]
): string {
  const replacer = (_k: string, v: unknown) => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o["toBase58"] === "function") return (o as { toBase58(): string }).toBase58();
      if (typeof o["toString"] === "function" && o.constructor?.name === "BN") return (o as { toString(): string }).toString();
    }
    if (typeof v === "bigint") return v.toString();
    return v;
  };
  return JSON.stringify(
    {
      network: graph.network,
      rpcUrl: graph.rpcUrl,
      fetchedAt: graph.fetchedAt.toISOString(),
      core: coreFindings,
      extensions: extReports.map((r) => ({
        programId: r.ext.programId.toBase58(),
        label: r.ext.label,
        variant: r.ext.variant,
        tiers: Object.fromEntries(r.tiers.map((t) => [t.name, t.achieved])),
        findings: r.findings,
      })),
      registry: registryFindings,
      warnings: [...new Set(warnings)],
    },
    replacer,
    2
  );
}

export function renderMermaid(graph: Graph): string {
  const { core } = graph;
  const lines: string[] = ["flowchart LR"];
  const id = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");
  const shortPk = (s: string) => s.slice(0, 4) + "…" + s.slice(-4);

  lines.push(`  MMINT["$M mint\\n${shortPk(core.mMintAddress.toBase58())}"]`);
  lines.push(`  EARN["earn\\nEarnGlobal ${shortPk(core.earn.globalPda.toBase58())}"]`);
  lines.push(`  PORTAL["portal\\n${shortPk(core.portal.globalPda.toBase58())}"]`);
  lines.push(`  SWAP["ext_swap\\nSwapGlobal ${shortPk(core.extSwap.globalPda.toBase58())}"]`);
  lines.push(`  WH["wormhole adapter"]`);
  lines.push(`  HL["hyperlane adapter"]`);
  lines.push(`  PORTAL -->|propagate_index CPI| EARN`);
  lines.push(`  EARN -->|ScaledUiAmount multiplier| MMINT`);
  lines.push(`  PORTAL -->|mint/burn authority| MMINT`);
  lines.push(`  WH --> PORTAL`);
  lines.push(`  HL --> PORTAL`);
  if (core.earn.global?.ext_swap_global_account.equals(core.extSwap.globalPda)) {
    lines.push(`  EARN -.->|ext_swap_global_account| SWAP`);
  }
  for (const r of graph.extensions) {
    const n = id(r.label ?? r.programId.toBase58());
    const label = r.label ?? shortPk(r.programId.toBase58());
    lines.push(`  ${n}["m_ext ${label}\\n[${r.variant ?? "?"}]"]`);
    if (r.global) {
      lines.push(`  ${n} -->|m_vault collateral| MMINT`);
      if (r.global.m_earn_global_account.equals(core.earn.globalPda)) lines.push(`  ${n} -.->|earn ref| EARN`);
      if (r.global.wrap_authorities.some((a) => a.equals(core.extSwap.globalPda))) lines.push(`  SWAP -->|wrap/unwrap CPI| ${n}`);
      const wl = core.extSwap.global?.whitelisted_extensions.some((e) => e.program_id.equals(r.programId));
      if (wl) lines.push(`  ${n} -.->|whitelisted| SWAP`);
    }
  }
  return "```mermaid\n" + lines.join("\n") + "\n```";
}
