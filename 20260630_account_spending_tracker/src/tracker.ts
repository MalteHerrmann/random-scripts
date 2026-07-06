import { formatEther, getAddress, type Address } from "viem";
import { fetchNormalTransactions, type EtherscanTx } from "./etherscan.js";

export interface TrackerOptions {
  address: Address;
  apiKey: string;
  count?: number;
  days?: number;
}

export interface TxBreakdown {
  hash: string;
  timestamp: Date;
  gasUsed: bigint;
  gasPrice: bigint;
  feeWei: bigint;
  valueWei: bigint;
  failed: boolean;
}

export interface SpendingReport {
  address: Address;
  txCount: number;
  totalFeeWei: bigint;
  totalFeeEth: string;
  totalValueWei: bigint;
  totalValueEth: string;
  totalSpentWei: bigint;
  totalSpentEth: string;
  earliest: Date | null;
  latest: Date | null;
  transactions: TxBreakdown[];
}

function txFee(tx: EtherscanTx): bigint {
  return BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
}

function toBreakdown(tx: EtherscanTx): TxBreakdown {
  return {
    hash: tx.hash,
    timestamp: new Date(Number(tx.timeStamp) * 1000),
    gasUsed: BigInt(tx.gasUsed),
    gasPrice: BigInt(tx.gasPrice),
    feeWei: txFee(tx),
    valueWei: BigInt(tx.value),
    failed: tx.isError === "1",
  };
}

export async function buildSpendingReport(
  opts: TrackerOptions,
): Promise<SpendingReport> {
  if (opts.count === undefined && opts.days === undefined) {
    throw new Error("Either `count` or `days` must be provided");
  }
  if (opts.count !== undefined && opts.days !== undefined) {
    throw new Error("Provide only one of `count` or `days`, not both");
  }

  const address = getAddress(opts.address);

  const txs = await fetchNormalTransactions({
    address,
    apiKey: opts.apiKey,
    sort: "desc",
    offset: 10000,
  });

  // Only count fees from transactions where this address is the sender.
  // The recipient never pays gas fees on the originating transaction.
  const sentByAddress = txs.filter(
    (tx) => tx.from.toLowerCase() === address.toLowerCase(),
  );

  let selected: EtherscanTx[];
  if (opts.count !== undefined) {
    selected = sentByAddress.slice(0, opts.count);
  } else {
    const cutoffMs = Date.now() - opts.days! * 24 * 60 * 60 * 1000;
    selected = sentByAddress.filter(
      (tx) => Number(tx.timeStamp) * 1000 >= cutoffMs,
    );
  }

  const breakdowns = selected.map(toBreakdown);
  const totalFeeWei = breakdowns.reduce((acc, tx) => acc + tx.feeWei, 0n);
  // Failed (reverted) txs still cost gas, but the ETH value is not transferred,
  // so only successful txs contribute to the outgoing value total.
  const totalValueWei = breakdowns.reduce(
    (acc, tx) => (tx.failed ? acc : acc + tx.valueWei),
    0n,
  );
  const totalSpentWei = totalFeeWei + totalValueWei;

  const timestamps = breakdowns.map((t) => t.timestamp.getTime());
  const earliest = timestamps.length
    ? new Date(Math.min(...timestamps))
    : null;
  const latest = timestamps.length
    ? new Date(Math.max(...timestamps))
    : null;

  return {
    address,
    txCount: breakdowns.length,
    totalFeeWei,
    totalFeeEth: formatEther(totalFeeWei),
    totalValueWei,
    totalValueEth: formatEther(totalValueWei),
    totalSpentWei,
    totalSpentEth: formatEther(totalSpentWei),
    earliest,
    latest,
    transactions: breakdowns,
  };
}
