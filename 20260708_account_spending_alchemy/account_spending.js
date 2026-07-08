// Account Spending Tracker — gas fee spending for an Ethereum account over a
// time window, using *exclusively* Alchemy APIs.
//
// Pipeline:
//   1. eth_blockNumber            -> latest block
//   2. targetTs = latestTs - delta
//   3. binary/interpolation search over eth_getBlockByNumber for the start block
//   4. alchemy_getAssetTransfers  -> outgoing (external) transfers since start block
//   5. eth_getTransactionReceipt  -> gasUsed + effectiveGasPrice per unique tx
//   6. sum gas cost, keep block timestamps
//   7. Prices API (historical)    -> ETH/USD around each tx timestamp
//   8. write a Google-Sheets-friendly CSV
//
// Run: ALCHEMY_API_KEY=<key> node account_spending.js [--address 0x..] [--days 30] [--out file.csv]

import { writeFileSync } from "node:fs";

// -------------------------
// Constants / config
//
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
if (!ALCHEMY_API_KEY) {
  console.error("Missing ALCHEMY_API_KEY environment variable.");
  process.exit(1);
}

// JSON-RPC node endpoint (blocks, receipts, asset transfers).
const NODE_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
// Prices REST API (the api key lives in the path for this product).
const PRICES_URL = `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/historical`;

const DEFAULT_WALLET = "0x347C26dE1DAEdd8417919bBe133566B93Feab19E";
const AVG_BLOCK_TIME = 14; // seconds, used only for the very first jump

const args = parseArgs(process.argv.slice(2));
const WALLET = (args.address ?? process.env.WALLET ?? DEFAULT_WALLET).toLowerCase();
const DAYS = Number(args.days ?? process.env.DAYS ?? 30);
const deltaSeconds = Math.round(DAYS * 24 * 60 * 60);
const OUT_FILE = args.out ?? `spending_${WALLET.slice(0, 10)}_${DAYS}d.csv`;

// Alchemy historical-price intervals and their maximum supported range.
const PRICE_INTERVALS = [
  { name: "5m", maxRange: 7 * 24 * 3600 },
  { name: "1h", maxRange: 30 * 24 * 3600 },
  { name: "1d", maxRange: 365 * 24 * 3600 },
];

// =========================================================================
// main
// =========================================================================
async function main() {
  console.log(`Account : ${WALLET}`);
  console.log(`Window  : last ${DAYS} day(s) (${deltaSeconds}s)\n`);

  // 1. latest block ------------------------------------------------------
  const latestNum = hexToNumber(await rpc("eth_blockNumber", []));
  const latestTs = await getBlockTimestamp(latestNum);
  console.log(`Latest block: ${latestNum} @ ${isoOf(latestTs)}`);

  // 2. target timestamp --------------------------------------------------
  const targetTs = latestTs - deltaSeconds;
  console.log(`Target start timestamp: ${isoOf(targetTs)}`);

  // 3. find the start block ----------------------------------------------
  const start = await findStartBlock(latestNum, latestTs, targetTs);
  console.log(
    `Start block : ${start.number} @ ${isoOf(start.timestamp)} ` +
      `(off by ${start.timestamp - targetTs}s, ${blockTsCache.size} block lookups)\n`,
  );

  // 4. outgoing transfers ------------------------------------------------
  // Pin toBlock to the latest number so the window matches the nonce check below.
  const transfers = await getOutgoingTransfers(toHex(start.number), toHex(latestNum));
  const byHash = new Map();
  for (const t of transfers) if (!byHash.has(t.hash)) byHash.set(t.hash, t);
  const uniqueTxs = [...byHash.values()];
  console.log(
    `Transfers: ${transfers.length} (${uniqueTxs.length} unique transactions)\n`,
  );

  // Coverage check: the account's nonce increments on EVERY transaction it
  // sends (including zero-ETH contract calls), so the nonce delta over the
  // window is the ground-truth transaction count. Compare it to what the
  // "external" transfers query actually returned.
  const nonceBefore = hexToNumber(
    await rpc("eth_getTransactionCount", [WALLET, toHex(Math.max(0, start.number - 1))]),
  );
  const nonceLatest = hexToNumber(await rpc("eth_getTransactionCount", [WALLET, toHex(latestNum)]));
  const txsSent = nonceLatest - nonceBefore;
  console.log(`Coverage    : account sent ${txsSent} tx(s) in window (by nonce); ` +
    `${uniqueTxs.length} captured as external transfers.`);
  if (txsSent > uniqueTxs.length) {
    console.warn(
      `  ⚠ ${txsSent - uniqueTxs.length} transaction(s) moved no top-level ETH ` +
        `(e.g. contract calls) and are NOT indexed as 'external' transfers — ` +
        `their gas is not included below.`,
    );
  }
  console.log();

  if (uniqueTxs.length === 0) {
    console.log("No outgoing external transfers in this window — nothing to write.");
    return;
  }

  // 5 + 6. receipts -> gas used / gas price / timestamp ------------------
  console.log("Fetching transaction receipts...");
  const rows = await mapLimit(uniqueTxs, 10, async (t) => {
    // receipt -> gas actually used + effective price; transaction -> msg.value
    const [receipt, tx] = await Promise.all([
      rpc("eth_getTransactionReceipt", [t.hash]),
      rpc("eth_getTransactionByHash", [t.hash]),
    ]);
    const gasUsed = BigInt(receipt.gasUsed);
    // effectiveGasPrice covers EIP-1559 + legacy; fall back to the tx gasPrice.
    const gasPriceWei = receipt.effectiveGasPrice
      ? BigInt(receipt.effectiveGasPrice)
      : BigInt(tx.gasPrice);
    const valueWei = BigInt(tx.value); // ETH transferred by the tx (msg.value)
    const costWei = gasUsed * gasPriceWei;

    const blockNumber = hexToNumber(receipt.blockNumber);
    const iso = t.metadata?.blockTimestamp ?? isoOf(await getBlockTimestamp(blockNumber));
    const tsUnix = Math.floor(Date.parse(iso) / 1000);

    return { hash: t.hash, blockNumber, iso, tsUnix, gasUsed, gasPriceWei, costWei, valueWei };
  });

  // 7. ETH price series (nearest bucket per tx) --------------------------
  console.log("Fetching historical ETH prices...");
  const series = await getEthPriceSeries(start.timestamp, latestTs);
  console.log(`Got ${series.length} price points.\n`);
  for (const row of rows) {
    row.ethPriceUsd = nearestPrice(series, row.tsUnix);
    row.gasCostEth = Number(weiToEthString(row.costWei));
    row.gasCostUsd = row.ethPriceUsd == null ? null : row.gasCostEth * row.ethPriceUsd;
    row.valueEth = Number(weiToEthString(row.valueWei));
    row.valueUsd = row.ethPriceUsd == null ? null : row.valueEth * row.ethPriceUsd;
  }

  rows.sort((a, b) => a.tsUnix - b.tsUnix);

  // 8. write CSV ---------------------------------------------------------
  writeCsv(OUT_FILE, rows);

  // totals (BigInt-summed for wei precision, then converted once)
  const totalGasUsed = rows.reduce((s, r) => s + r.gasUsed, 0n);
  const totalCostEth = Number(weiToEthString(rows.reduce((s, r) => s + r.costWei, 0n)));
  const totalValueEth = Number(weiToEthString(rows.reduce((s, r) => s + r.valueWei, 0n)));
  const totalCostUsd = rows.reduce((s, r) => s + (r.gasCostUsd ?? 0), 0);
  const totalValueUsd = rows.reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  console.log(`Wrote ${rows.length} rows to ${OUT_FILE}`);
  console.log("\n--- Totals ---");
  console.log(`Transactions : ${rows.length}`);
  console.log(`Gas used     : ${totalGasUsed.toString()}`);
  console.log(`Gas cost     : ${totalCostEth.toFixed(6)} ETH  ($${totalCostUsd.toFixed(2)})`);
  console.log(`Value sent   : ${totalValueEth.toFixed(6)} ETH  ($${totalValueUsd.toFixed(2)})`);
  console.log(
    `Total outflow: ${(totalCostEth + totalValueEth).toFixed(6)} ETH  ` +
      `($${(totalCostUsd + totalValueUsd).toFixed(2)})  (nearest-bucket price)`,
  );
}

// =========================================================================
// Step 3 — locate the start block
// =========================================================================
const blockTsCache = new Map();
async function getBlockTimestamp(num) {
  if (blockTsCache.has(num)) return blockTsCache.get(num);
  const block = await rpc("eth_getBlockByNumber", [toHex(num), false]);
  const ts = hexToNumber(block.timestamp);
  blockTsCache.set(num, ts);
  return ts;
}

// Find the first block whose timestamp is >= targetTs.
// Strategy: one big jump sized by average block time, refine the jump from the
// *actual* observed block time, then converge by halving the jump (binary
// search) and finish with a short linear walk to the exact boundary block.
async function findStartBlock(latestNum, latestTs, targetTs) {
  // (1) initial jump using the ~14s average block time
  let jump = Math.max(1, Math.round((latestTs - targetTs) / AVG_BLOCK_TIME));
  let block = clamp(latestNum - jump, 1, latestNum);
  let ts = await getBlockTimestamp(block);

  // (2) refine the jump from the real average block time between latest and guess
  const observed = (latestTs - ts) / (latestNum - block) || AVG_BLOCK_TIME;
  jump = Math.max(1, Math.round(Math.abs(ts - targetTs) / observed));

  // (3) converge, halving the jump each iteration
  while (jump >= 1) {
    if (ts > targetTs) block = clamp(block - jump, 1, latestNum); // too new -> older
    else if (ts < targetTs) block = clamp(block + jump, 1, latestNum); // too old -> newer
    else break; // exact hit
    ts = await getBlockTimestamp(block);
    if (jump === 1) break;
    jump = Math.floor(jump / 2);
  }

  // (4) land exactly on the first block with ts >= targetTs
  while (ts < targetTs && block < latestNum) {
    block += 1;
    ts = await getBlockTimestamp(block);
  }
  while (block > 1) {
    const prevTs = await getBlockTimestamp(block - 1);
    if (prevTs >= targetTs) {
      block -= 1;
      ts = prevTs;
    } else break;
  }

  return { number: block, timestamp: ts };
}

// =========================================================================
// Step 4 — outgoing transfers (paginated)
// =========================================================================
async function getOutgoingTransfers(fromBlockHex, toBlockHex) {
  const transfers = [];
  let pageKey;
  do {
    const params = [
      {
        fromBlock: fromBlockHex,
        toBlock: toBlockHex,
        fromAddress: WALLET,
        category: ["external"], // ETH transfers sent by the account
        withMetadata: true, // includes metadata.blockTimestamp
        excludeZeroValue: false,
        order: "asc",
        maxCount: "0x3e8", // 1000 per page (max)
        ...(pageKey ? { pageKey } : {}),
      },
    ];
    const result = await rpc("alchemy_getAssetTransfers", params);
    transfers.push(...(result.transfers ?? []));
    pageKey = result.pageKey;
  } while (pageKey);
  return transfers;
}

// =========================================================================
// Step 7 — historical ETH price series
// =========================================================================
async function getEthPriceSeries(startTs, endTs) {
  const windowSec = Math.max(1, endTs - startTs);
  const interval =
    PRICE_INTERVALS.find((i) => windowSec <= i.maxRange) ??
    PRICE_INTERVALS[PRICE_INTERVALS.length - 1];

  const points = [];
  for (const [s, e] of splitRange(startTs, endTs, interval.maxRange)) {
    const res = await fetchWithRetry(PRICES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "ETH", startTime: s, endTime: e, interval: interval.name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Prices API failed (${res.status}): ${JSON.stringify(json)}`);
    }
    for (const d of json.data ?? []) {
      points.push({ ts: Math.floor(Date.parse(d.timestamp) / 1000), value: Number(d.value) });
    }
  }
  points.sort((a, b) => a.ts - b.ts);
  return points;
}

// Nearest price point (by absolute time distance) to a target timestamp.
function nearestPrice(series, ts) {
  if (series.length === 0) return null;
  if (ts <= series[0].ts) return series[0].value;
  if (ts >= series[series.length - 1].ts) return series[series.length - 1].value;
  let lo = 0;
  let hi = series.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ts === ts) return series[mid].value;
    if (series[mid].ts < ts) lo = mid + 1;
    else hi = mid - 1;
  }
  // lo = first point after ts, hi = last point before ts
  const before = series[hi];
  const after = series[lo];
  return ts - before.ts <= after.ts - ts ? before.value : after.value;
}

// =========================================================================
// Step 8 — CSV
// =========================================================================
function writeCsv(file, rows) {
  const header = [
    "txHash",
    "blockNumber",
    "blockTimestamp",
    "gasUsed",
    "effectiveGasPriceWei",
    "effectiveGasPriceGwei",
    "gasCostEth",
    "valueEth",
    "ethPriceUsd",
    "gasCostUsd",
    "valueUsd",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.hash,
        r.blockNumber,
        r.iso,
        r.gasUsed.toString(),
        r.gasPriceWei.toString(),
        (Number(r.gasPriceWei) / 1e9).toFixed(4),
        weiToEthString(r.costWei),
        weiToEthString(r.valueWei),
        r.ethPriceUsd == null ? "" : r.ethPriceUsd.toFixed(2),
        r.gasCostUsd == null ? "" : r.gasCostUsd.toFixed(6),
        r.valueUsd == null ? "" : r.valueUsd.toFixed(2),
      ].join(","),
    );
  }
  writeFileSync(file, lines.join("\n") + "\n");
}

// =========================================================================
// Alchemy JSON-RPC + HTTP helpers
// =========================================================================
async function rpc(method, params) {
  const res = await fetchWithRetry(NODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    throw new Error(`${method} failed: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} failed: HTTP ${res.status}`);
  }
  return json.result;
}

async function fetchWithRetry(url, options, retries = 5) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= retries) return res;
    await sleep(backoff(attempt));
  }
}

// =========================================================================
// small utilities
// =========================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => Math.min(4000, 250 * 2 ** attempt);
const toHex = (n) => "0x" + n.toString(16);
const hexToNumber = (h) => parseInt(h, 16);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const isoOf = (ts) => new Date(ts * 1000).toISOString();

// wei (BigInt) -> decimal ETH string, no float rounding
function weiToEthString(wei) {
  const s = wei.toString().padStart(19, "0");
  const intPart = s.slice(0, -18);
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart;
}

// split [start, end] into chunks no larger than maxRange seconds
function splitRange(start, end, maxRange) {
  const chunks = [];
  let s = start;
  while (s < end) {
    const e = Math.min(s + maxRange, end);
    chunks.push([s, e]);
    s = e;
  }
  return chunks.length ? chunks : [[start, end]];
}

// run async fn over items with a bounded number of workers
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// minimal --flag value parser
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
