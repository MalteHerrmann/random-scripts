/**
 * Minimal EVM hub reader — plain JSON-RPC eth_call, no web3 dependency.
 *
 * The $M index and the earner merkle root originate on the Ethereum hub
 * (Sepolia for devnet) and are bridged to Solana. Comparing hub state against
 * what landed on Solana is the only way to measure propagation lag.
 */

// keccak-256 selectors (verified with `cast sig` and live Sepolia calls)
const SEL_CURRENT_INDEX = "0x26987b60"; // currentIndex() -> uint256, 1e12-scaled
const SEL_EARNER_RATE = "0xc23465b3"; // earnerRate() -> uint32, bps APY
const SEL_GET_ROOT = "0x84f94221"; // getRoot(bytes32) -> bytes32
// bytes32("solana-earners")
const LIST_SOLANA_EARNERS = "736f6c616e612d6561726e657273000000000000000000000000000000000000";

export interface HubState {
  rpcUrl: string;
  mToken: string;
  merkleTreeBuilder: string;
  /** $M.currentIndex(), 1e12-scaled */
  index: bigint;
  /** earner rate in bps APY (continuous), null if the call failed */
  earnerRateBps: number | null;
  /** getRoot("solana-earners") as 0x-hex */
  earnerMerkleRoot: string;
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`eth_call HTTP ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (body.error) throw new Error(`eth_call: ${body.error.message}`);
  if (!body.result || body.result === "0x") throw new Error("eth_call returned empty result (wrong address?)");
  return body.result;
}

export async function fetchHubState(rpcUrl: string, mToken: string, merkleTreeBuilder: string): Promise<HubState> {
  const [indexHex, rootHex] = await Promise.all([
    ethCall(rpcUrl, mToken, SEL_CURRENT_INDEX),
    ethCall(rpcUrl, merkleTreeBuilder, SEL_GET_ROOT + LIST_SOLANA_EARNERS),
  ]);

  let earnerRateBps: number | null = null;
  try {
    earnerRateBps = Number(BigInt(await ethCall(rpcUrl, mToken, SEL_EARNER_RATE)));
  } catch {
    // optional — drift is still reportable in bps without a time estimate
  }

  return {
    rpcUrl,
    mToken,
    merkleTreeBuilder,
    index: BigInt(indexHex),
    earnerRateBps,
    earnerMerkleRoot: "0x" + rootHex.slice(2).padStart(64, "0").slice(-64),
  };
}

/**
 * Estimate how long ago the hub index equalled `solanaIndex`, assuming
 * continuous compounding at the hub's earner rate:
 *   t = ln(hubIndex / solanaIndex) / rate
 */
export function impliedLagDays(hubIndex: bigint, solanaIndex: bigint, earnerRateBps: number): number | null {
  if (earnerRateBps <= 0 || solanaIndex <= 0n || hubIndex <= solanaIndex) return null;
  const ratio = Number(hubIndex) / Number(solanaIndex);
  return (Math.log(ratio) / (earnerRateBps / 10_000)) * 365;
}
