import { createConnection } from "./rpc.js";
import { createClassifier } from "./authority/classify.js";

// Addresses from Notion "Current unknown addresses (Solana authorities)".
// Each entry: the address + every role it holds (deduped across roles).
type Entry = { address: string; token: string; roles: string[] };

const MAINNET: Entry[] = [
  { address: "Anfx7wng5TEe5UrkFKTirtADBawmtRs9KoD15BUbEmvT", token: "WrappedM by M0", roles: ["Mint Authority PDA"] },
  { address: "Am4facCvkQkHjwSArPX8Jqxs1ss14XMoC8JkTV3BDG95", token: "USD.tel", roles: ["Mint Authority"] },
  { address: "98Ck1KwGZcbPsY5bexhLnEBPWhkyrCMbNd9RpxGwJTKc", token: "USD.tel", roles: ["Freeze", "Metadata Pointer", "Pausable Config", "Token Metadata", "Transfer Hook"] },
  { address: "F4fpAN5ZSFm9QJ5WTWemgnV6ktwwWQS5DPB4m1pCJinu", token: "XO Cash", roles: ["Mint Authority"] },
  { address: "AgNSjv3CWETjQgcLK5MkTzRSt3KirbrBqGagjv5AKbCR", token: "XO Cash", roles: ["Freeze", "Permanent Delegate", "Transfer Hook", "Metadata Pointer", "Token Metadata", "Confidential Transfer", "Pausable Config"] },
  { address: "8YpABqeKbg1xLWQAVrmGV87K5SPSnNXZ6AzS32o8UXy5", token: "USD+", roles: ["Mint Authority"] },
  { address: "JCvMkyfm7iM4gAUfQ43A8BWFWktAjPjPMqbTpZvAG3MC", token: "USD+", roles: ["Freeze"] },
  { address: "C9eLDmptrnMxFb5QB3J4QuRFYjZFba7393ncm9cM7ot7", token: "USDK — Kast Dollar", roles: ["Mint Authority", "Scaled UI Config"] },
  { address: "7Ahg145ZRP5LASPjAphRcHoR1UgvLjbZR5MP1j3dPpFr", token: "USDK + USDKy (Kast)", roles: ["Freeze"] },
  { address: "EvEenAb6tQdgUCMgv9fpgxMzLw4Cj2PcQLbJbTEreQCm", token: "USDKy — Kast Yield Dollar", roles: ["Mint Authority", "Scaled UI Config"] },
];

const DEVNET: Entry[] = [
  { address: "6qjWiZiUV9WpXQoqMzVSaYSiwSSgoSFPf7v4vVAm778f", token: "USDK — Kast Dollar (devnet)", roles: ["Mint Authority", "Scaled UI Config"] },
  { address: "ASJTBEYfsQxeYLCx9MsezqpgobiJSoqHPFmhrhoB1YVD", token: "USDKy — Kast Yield Dollar (devnet)", roles: ["Mint Authority", "Scaled UI Config"] },
];

async function main() {
  const network = process.argv[2] === "devnet" ? "devnet" : "mainnet";
  const entries = network === "devnet" ? DEVNET : MAINNET;
  const conn = createConnection();
  const classify = createClassifier(conn);

  const out: unknown[] = [];
  for (const e of entries) {
    const h = await classify(e.address);
    out.push({
      token: e.token,
      roles: e.roles,
      address: e.address,
      classification: h.classification,
      onCurve: h.onCurve,
      exists: h.exists,
      owner: h.owner,
      lamports: h.lamports,
      details: h.details,
    });
    const d = h.details && Object.keys(h.details).length ? ` ${JSON.stringify(h.details)}` : "";
    console.error(
      `[${network}] ${e.address}  ->  ${h.classification}  (onCurve=${h.onCurve}, owner=${h.owner ?? "—"})${d}`
    );
  }
  console.log(JSON.stringify({ network, results: out }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
