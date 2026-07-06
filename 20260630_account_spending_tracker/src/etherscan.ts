import type { Address, Hex } from "viem";

const ETHERSCAN_BASE_URL = "https://api.etherscan.io/v2/api";
const ETHEREUM_MAINNET_CHAIN_ID = 1;

export interface EtherscanTx {
  blockNumber: string;
  timeStamp: string;
  hash: Hex;
  nonce: string;
  blockHash: Hex;
  transactionIndex: string;
  from: Address;
  to: Address | "";
  value: string;
  gas: string;
  gasPrice: string;
  isError: "0" | "1";
  txreceipt_status: "0" | "1" | "";
  input: Hex;
  contractAddress: Address | "";
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
  methodId: Hex;
  functionName: string;
}

interface EtherscanResponse<T> {
  status: "0" | "1";
  message: string;
  result: T;
}

export interface FetchOptions {
  address: Address;
  apiKey: string;
  chainId?: number;
  startBlock?: number;
  endBlock?: number;
  page?: number;
  offset?: number;
  sort?: "asc" | "desc";
}

export async function fetchNormalTransactions(
  opts: FetchOptions,
): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    chainid: String(opts.chainId ?? ETHEREUM_MAINNET_CHAIN_ID),
    module: "account",
    action: "txlist",
    address: opts.address,
    startblock: String(opts.startBlock ?? 0),
    endblock: String(opts.endBlock ?? 99999999),
    page: String(opts.page ?? 1),
    offset: String(opts.offset ?? 10000),
    sort: opts.sort ?? "desc",
    apikey: opts.apiKey,
  });

  const url = `${ETHERSCAN_BASE_URL}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Etherscan request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as EtherscanResponse<
    EtherscanTx[] | string
  >;

  if (data.status === "0") {
    // Etherscan returns status "0" with message "No transactions found" when empty.
    if (data.message === "No transactions found") {
      return [];
    }
    throw new Error(
      `Etherscan API error: ${data.message} (${typeof data.result === "string" ? data.result : "unknown"})`,
    );
  }

  return data.result as EtherscanTx[];
}
