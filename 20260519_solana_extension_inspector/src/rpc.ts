import { Connection } from "@solana/web3.js";

export function createConnection(rpcUrl?: string): Connection {
  const url = rpcUrl ?? process.env["RPC_URL"];
  if (!url) {
    throw new Error(
      "No RPC URL provided. Pass --rpc <URL> or set the RPC_URL environment variable."
    );
  }
  return new Connection(url, "confirmed");
}
