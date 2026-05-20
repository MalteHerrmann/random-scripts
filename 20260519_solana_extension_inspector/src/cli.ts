import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { writeFileSync } from "fs";
import { createConnection } from "./rpc.js";
import { getProgramInfo } from "./program/info.js";
import { getUpgradeHistory } from "./program/history.js";
import { getAnchorIdl } from "./program/anchor-idl.js";
import { getMintInfo } from "./mint/info.js";
import { createClassifier } from "./authority/classify.js";
import type { AuditReport, AuthorityHolder } from "./types.js";

const program = new Command();

program
  .name("audit")
  .description("Solana Program & Token-2022 Authority Audit Tool")
  .requiredOption("--program <PUBKEY>", "Program ID to audit")
  .requiredOption("--mint <PUBKEY>", "Token-2022 mint to audit")
  .option("--rpc <URL>", "RPC endpoint URL (default: RPC_URL env var)")
  .option("--out <PATH>", "Output file path")
  .parse(process.argv);

const opts = program.opts<{
  program: string;
  mint: string;
  rpc?: string;
  out?: string;
}>();

async function main() {
  let programId: PublicKey;
  let mintId: PublicKey;
  try {
    programId = new PublicKey(opts.program);
    mintId = new PublicKey(opts.mint);
  } catch (err) {
    console.error(`Invalid public key: ${String(err)}`);
    process.exit(1);
  }

  let conn;
  try {
    conn = createConnection(opts.rpc);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  const rpcEndpoint = (conn as unknown as { rpcEndpoint: string }).rpcEndpoint;
  const classify = createClassifier(conn);

  console.log(`Auditing program: ${programId.toBase58()}`);
  console.log(`Auditing mint:    ${mintId.toBase58()}`);
  console.log(`RPC endpoint:     ${rpcEndpoint}`);
  console.log("");

  const [programCore, mintInfo, anchorIdl] = await Promise.all([
    getProgramInfo(conn, programId, classify).catch((err: unknown) => {
      console.error(`[ERROR] Program info: ${String(err)}`);
      process.exit(1);
    }),
    getMintInfo(conn, mintId, classify).catch((err: unknown) => {
      console.error(`[ERROR] Mint info: ${String(err)}`);
      process.exit(1);
    }),
    getAnchorIdl(conn, programId),
  ]);

  let upgradeHistory: AuditReport["program"]["upgradeHistory"] = [];
  if (programCore.programDataAddress) {
    const historyResult = await getUpgradeHistory(
      conn,
      new PublicKey(programCore.programDataAddress)
    );
    upgradeHistory = historyResult.history;
    if (historyResult.warning) {
      console.warn(`[WARN] Upgrade history: ${historyResult.warning}`);
    }
  }

  const report: AuditReport = {
    auditedAt: new Date().toISOString(),
    rpcEndpoint,
    program: {
      ...programCore,
      upgradeHistory,
      anchorIdl,
    },
    mint: mintInfo,
  };

  const outPath =
    opts.out ??
    `./audit-${programId.toBase58().slice(0, 8)}-${mintId.toBase58().slice(0, 8)}.json`;

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report written to: ${outPath}`);

  // Print summary
  console.log("\n=== Authority Summary ===");
  const authorities: Array<{ label: string; holder: AuthorityHolder }> = [
    { label: "Program upgrade authority", holder: report.program.upgradeAuthority },
    { label: "Mint authority", holder: report.mint.mintAuthority },
    { label: "Freeze authority", holder: report.mint.freezeAuthority },
  ];
  for (const ext of report.mint.extensions) {
    if ("authority" in ext && ext.authority && typeof ext.authority === "object") {
      authorities.push({ label: `${ext.type} authority`, holder: ext.authority as AuthorityHolder });
    }
    if ("delegate" in ext && ext.delegate && typeof ext.delegate === "object") {
      authorities.push({ label: `${ext.type} delegate`, holder: ext.delegate as AuthorityHolder });
    }
  }
  for (const { label, holder } of authorities) {
    const pk = holder.pubkey ? holder.pubkey.slice(0, 8) + "..." : "None";
    console.log(`  ${label}: ${pk} [${holder.classification}]`);
  }

  const findings = authorities.filter(
    (a) => a.holder.classification === "eoa" || a.holder.classification === "unfunded_eoa"
  );
  if (findings.length > 0) {
    console.log(`\nWARN: ${findings.length} EOA authority/authorities found — review carefully.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
