#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { formatEther, isAddress, type Address } from "viem";
import { buildSpendingReport, type SpendingReport } from "./tracker.js";

function printReport(report: SpendingReport, verbose: boolean): void {
  console.log("");
  console.log(`Address:        ${report.address}`);
  console.log(`Transactions:   ${report.txCount}`);
  if (report.earliest && report.latest) {
    console.log(`Range:          ${report.earliest.toISOString()}`);
    console.log(`                ${report.latest.toISOString()}`);
  }
  console.log(`Total gas fees: ${report.totalFeeEth} ETH`);
  console.log(`Total value:    ${report.totalValueEth} ETH  (outgoing, successful txs only)`);
  console.log(`Total spent:    ${report.totalSpentEth} ETH  (value + fees)`);
  console.log("");

  if (!verbose || report.transactions.length === 0) return;

  console.log("Per-transaction breakdown:");
  console.log("─".repeat(120));
  console.log(
    `${"timestamp".padEnd(19)}  ${"value (ETH)".padStart(14)}  ${"fee (ETH)".padStart(14)}  hash`,
  );
  console.log("─".repeat(120));
  for (const tx of report.transactions) {
    const date = tx.timestamp.toISOString().replace("T", " ").slice(0, 19);
    const value = formatEther(tx.valueWei).padStart(14);
    const fee = formatEther(tx.feeWei).padStart(14);
    const status = tx.failed ? " [FAILED]" : "";
    console.log(`${date}  ${value}  ${fee}  ${tx.hash}${status}`);
  }
  console.log("─".repeat(120));
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("spending-tracker")
    .description(
      "Track gas-fee spending of an Ethereum mainnet account via Etherscan",
    )
    .requiredOption("-a, --address <address>", "Ethereum address to track")
    .option("-n, --count <count>", "Trace the most recent N transactions", (v) =>
      Number.parseInt(v, 10),
    )
    .option("-d, --days <days>", "Trace transactions from the last N days", (v) =>
      Number.parseInt(v, 10),
    )
    .option("-v, --verbose", "Print per-transaction breakdown", false)
    .option(
      "-k, --api-key <key>",
      "Etherscan API key (overrides ETHERSCAN_API_KEY env)",
    )
    .parse(process.argv);

  const opts = program.opts<{
    address: string;
    count?: number;
    days?: number;
    verbose: boolean;
    apiKey?: string;
  }>();

  if (!isAddress(opts.address)) {
    console.error(`Error: "${opts.address}" is not a valid Ethereum address`);
    process.exit(1);
  }

  if (opts.count === undefined && opts.days === undefined) {
    console.error("Error: provide either --count <N> or --days <N>");
    process.exit(1);
  }
  if (opts.count !== undefined && opts.days !== undefined) {
    console.error("Error: --count and --days are mutually exclusive");
    process.exit(1);
  }
  if (opts.count !== undefined && (!Number.isFinite(opts.count) || opts.count <= 0)) {
    console.error("Error: --count must be a positive integer");
    process.exit(1);
  }
  if (opts.days !== undefined && (!Number.isFinite(opts.days) || opts.days <= 0)) {
    console.error("Error: --days must be a positive integer");
    process.exit(1);
  }

  const apiKey = opts.apiKey ?? process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: Etherscan API key required. Set ETHERSCAN_API_KEY env var or pass --api-key.",
    );
    process.exit(1);
  }

  const report = await buildSpendingReport({
    address: opts.address as Address,
    apiKey,
    count: opts.count,
    days: opts.days,
  });

  printReport(report, opts.verbose);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
