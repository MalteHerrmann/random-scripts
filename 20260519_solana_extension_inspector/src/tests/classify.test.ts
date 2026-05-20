import { describe, it, expect, vi } from "vitest";
import { createClassifier } from "../authority/classify.js";
import type { Connection } from "@solana/web3.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const GOV_PROGRAM = "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";

// Verified on-curve: a normal wallet address
const ON_CURVE_KEY = "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy";
// Verified off-curve: all-bytes-to-1 base58 is not on the ed25519 curve
const OFF_CURVE_KEY = "11111111111111111111111111111112";

function makeConn(accountInfo: { owner: string; lamports: number; data: Buffer } | null, extraMocks?: Partial<Connection>) {
  return {
    getAccountInfo: vi.fn().mockResolvedValue(
      accountInfo
        ? {
            owner: { toBase58: () => accountInfo.owner },
            lamports: accountInfo.lamports,
            data: accountInfo.data,
          }
        : null
    ),
    getSignaturesForAddress: vi.fn().mockResolvedValue([]),
    ...extraMocks,
  } as unknown as Connection;
}

describe("classifyAuthority", () => {
  it("returns none for null pubkey", async () => {
    const classify = createClassifier(makeConn(null));
    const result = await classify(null);
    expect(result.classification).toBe("none");
    expect(result.pubkey).toBeNull();
  });

  it("returns eoa for on-curve system-owned account", async () => {
    const classify = createClassifier(
      makeConn({ owner: SYSTEM_PROGRAM, lamports: 1_000_000, data: Buffer.alloc(0) })
    );
    const result = await classify(ON_CURVE_KEY);
    expect(result.classification).toBe("eoa");
    expect(result.exists).toBe(true);
  });

  it("returns system_pda for off-curve system-owned account with no squads transactions", async () => {
    const classify = createClassifier(
      makeConn({ owner: SYSTEM_PROGRAM, lamports: 1_000_000, data: Buffer.alloc(0) })
    );
    // OFF_CURVE_KEY is off-curve; getSignaturesForAddress returns [] so no Squads detection
    const result = await classify(OFF_CURVE_KEY);
    expect(result.classification).toBe("system_pda");
    expect(result.exists).toBe(true);
  });

  it("returns unfunded_eoa for non-existent on-curve key", async () => {
    const classify = createClassifier(makeConn(null));
    const result = await classify(ON_CURVE_KEY);
    expect(result.classification).toBe("unfunded_eoa");
    expect(result.exists).toBe(false);
  });

  it("returns program_owned_other for unknown program owner", async () => {
    const classify = createClassifier(
      makeConn({ owner: "So11111111111111111111111111111111111111112", lamports: 5000, data: Buffer.alloc(0) })
    );
    const result = await classify(ON_CURVE_KEY);
    expect(result.classification).toBe("program_owned_other");
  });

  it("returns spl_governance for governance-owned account", async () => {
    const data = Buffer.alloc(10);
    data[0] = 4; // Governance account type
    const classify = createClassifier(
      makeConn({ owner: GOV_PROGRAM, lamports: 5000, data })
    );
    const result = await classify(ON_CURVE_KEY);
    expect(result.classification).toBe("spl_governance");
    expect((result.details as Record<string, unknown>)["accountType"]).toBe("Governance");
  });

  it("memoizes results for the same pubkey", async () => {
    const conn = makeConn({ owner: SYSTEM_PROGRAM, lamports: 1000, data: Buffer.alloc(0) });
    const classify = createClassifier(conn);
    await classify(ON_CURVE_KEY);
    await classify(ON_CURVE_KEY);
    expect(conn.getAccountInfo).toHaveBeenCalledTimes(1);
  });
});
