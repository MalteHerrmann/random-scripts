import { PublicKey } from "@solana/web3.js";
import {
  AccountMetasData,
  ChainBridgePaths,
  EarnGlobal,
  ExtGlobalV2,
  HyperlaneGlobal,
  Peer,
  PortalGlobal,
  SwapGlobal,
  Variant,
  WormholeGlobal,
  YieldConfigCrank,
  YieldConfigNoYield,
  YieldConfigScaledUi,
} from "./types.js";

/**
 * Minimal borsh reader with strict bounds checks.
 *
 * We deliberately do NOT use Anchor's BorshCoder here: when the deployed
 * program's account layout differs from the vendored IDL (older deployments,
 * exactly what this tool needs to diagnose), Anchor's vec decoding reads a
 * garbage length and allocates unbounded memory. This reader throws a clean
 * RangeError instead, which callers surface as a "layout mismatch" warning.
 */
class Reader {
  private off: number;
  constructor(private readonly data: Buffer, skipDiscriminator = true) {
    this.off = skipDiscriminator ? 8 : 0;
    if (this.off > data.length) throw new RangeError("buffer shorter than discriminator");
  }
  private need(n: number) {
    if (this.off + n > this.data.length) {
      throw new RangeError(`read past end of account data (offset ${this.off}, need ${n}, len ${this.data.length})`);
    }
  }
  u8(): number {
    this.need(1);
    return this.data[this.off++];
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  u32(): number {
    this.need(4);
    const v = this.data.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  u64(): bigint {
    this.need(8);
    const v = this.data.readBigUInt64LE(this.off);
    this.off += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.u64();
    const hi = this.u64();
    return (hi << 64n) | lo;
  }
  bytes(n: number): Buffer {
    this.need(n);
    const v = this.data.subarray(this.off, this.off + n);
    this.off += n;
    return Buffer.from(v);
  }
  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }
  option<T>(read: () => T): T | null {
    const tag = this.u8();
    if (tag === 0) return null;
    if (tag === 1) return read();
    throw new RangeError(`invalid Option tag ${tag} at offset ${this.off - 1}`);
  }
  /** minElemSize guards against garbage lengths from layout drift */
  vec<T>(read: () => T, minElemSize: number): T[] {
    const len = this.u32();
    if (len * minElemSize > this.data.length - this.off) {
      throw new RangeError(`vec length ${len} (≥${len * minElemSize} bytes) exceeds remaining ${this.data.length - this.off} bytes`);
    }
    const out: T[] = [];
    for (let i = 0; i < len; i++) out.push(read());
    return out;
  }
  skip(n: number) {
    this.need(n);
    this.off += n;
  }
}

/* ------------------------- discriminators (from the vendored IDLs) ------------------------- */

export const DISCRIMINATORS: Record<string, Buffer> = {
  EarnGlobal: Buffer.from([229, 50, 25, 132, 207, 93, 185, 23]),
  PortalGlobal: Buffer.from([83, 250, 129, 21, 172, 135, 20, 236]),
  SwapGlobal: Buffer.from([15, 184, 147, 129, 183, 219, 223, 163]),
  ExtGlobalV2: Buffer.from([116, 209, 219, 83, 70, 143, 55, 127]),
  WormholeGlobal: Buffer.from([116, 100, 187, 174, 88, 1, 91, 250]),
  HyperlaneGlobal: Buffer.from([139, 60, 79, 223, 221, 146, 42, 102]),
  ChainBridgePaths: Buffer.from([89, 30, 178, 53, 154, 232, 75, 140]),
  AccountMetasData: Buffer.from([18, 230, 15, 151, 89, 53, 116, 8]),
};

export function matchDiscriminator(data: Buffer): string | null {
  if (data.length < 8) return null;
  const head = data.subarray(0, 8);
  for (const [name, disc] of Object.entries(DISCRIMINATORS)) {
    if (head.equals(disc)) return name;
  }
  return null;
}

/* ----------------------------------- account decoders ----------------------------------- */

export function decodeEarnGlobal(data: Buffer): EarnGlobal {
  const r = new Reader(data);
  return {
    admin: r.pubkey(),
    m_mint: r.pubkey(),
    portal_authority: r.pubkey(),
    ext_swap_global_account: r.pubkey(),
    earner_merkle_root: [...r.bytes(32)],
    bump: r.u8(),
  };
}

export function decodePortalGlobal(data: Buffer): PortalGlobal {
  const r = new Reader(data);
  return {
    bump: r.u8(),
    chain_id: r.u32(),
    m_mint: r.pubkey(),
    admin: r.pubkey(),
    outgoing_paused: r.bool(),
    incoming_paused: r.bool(),
    m_index: r.u128(),
    message_nonce: r.u64(),
    pending_admin: r.option(() => r.pubkey()),
    isolated_hub_chain_id: r.option(() => r.u32()),
    unclaimed_m_balance: r.u64(),
  };
}

function readPeer(r: Reader): Peer {
  return {
    address: [...r.bytes(32)],
    m0_chain_id: r.u32(),
    adapter_chain_id: r.u32(),
  };
}

export function decodeWormholeGlobal(data: Buffer): WormholeGlobal {
  const r = new Reader(data);
  return {
    bump: r.u8(),
    admin: r.pubkey(),
    outgoing_paused: r.bool(),
    incoming_paused: r.bool(),
    chain_id: r.u32(),
    receive_lut: r.option(() => r.pubkey()),
    pending_admin: r.option(() => r.pubkey()),
    peers: r.vec(() => readPeer(r), 40), // Peers tuple struct = plain Vec<Peer>
  };
}

export function decodeHyperlaneGlobal(data: Buffer): HyperlaneGlobal {
  const r = new Reader(data);
  return {
    bump: r.u8(),
    admin: r.pubkey(),
    outgoing_paused: r.bool(),
    incoming_paused: r.bool(),
    chain_id: r.u32(),
    igp_program_id: r.pubkey(),
    igp_gas_amount: r.u64(),
    igp_account: r.pubkey(),
    igp_overhead_account: r.option(() => r.pubkey()),
    ism: r.option(() => r.pubkey()),
    pending_admin: r.option(() => r.pubkey()),
    peers: r.vec(() => readPeer(r), 40),
  };
}

export function decodeAccountMetasData(data: Buffer): AccountMetasData {
  const r = new Reader(data);
  return {
    bump: r.u8(),
    m_mint: r.pubkey(),
    extensions: r.vec(() => ({ program_id: r.pubkey(), mint: r.pubkey(), token_program: r.pubkey() }), 96),
  };
}

export function decodeSwapGlobal(data: Buffer): SwapGlobal {
  const r = new Reader(data);
  return {
    bump: r.u8(),
    admin: r.pubkey(),
    whitelisted_unwrappers: r.vec(() => r.pubkey(), 32),
    whitelisted_extensions: r.vec(() => ({ program_id: r.pubkey(), mint: r.pubkey(), token_program: r.pubkey() }), 96),
  };
}

export function decodeChainBridgePaths(data: Buffer): ChainBridgePaths {
  const r = new Reader(data);
  return {
    bump: r.u8(),
    destination_chain_id: r.u32(),
    paths: r.vec(() => ({ source_mint: r.pubkey(), destination_token: [...r.bytes(32)] }), 64),
  };
}

/**
 * ExtGlobalV2 decoding has to cope with multiple generations of the struct
 * sharing one discriminator:
 *   - `pending_admin: Option<Pubkey>` was added at some revision (absent in
 *     e.g. the wm_ext build's IDL),
 *   - the crank YieldConfig was `{variant, earn_authority, index, timestamp}`
 *     before becoming `{variant, earn_authority, last_m_index, last_ext_index,
 *     timestamp}` (devnet wM still runs the former).
 *
 * The correct layout is the candidate that (a) decodes within bounds, (b) has a
 * variant tag matching the candidate's variant, and (c) has a total account
 * length equal to what the program allocates for that generation and wrap-
 * authority count (see `expectedExtGlobalLen`). Modern layouts are tried first.
 *
 * We validate against the program's *allocated* size rather than requiring the
 * decode to consume the buffer exactly. `pending_admin: Option<Pubkey>` is
 * allocated at its 33-byte maximum (`ExtGlobalV2::size()`), but serializes to a
 * single byte when `None` — leaving 32 trailing bytes that are NOT guaranteed to
 * be zero: they retain stale data from when the field (or a longer wrap-authority
 * list) was last written. An all-zero-tail check therefore wrongly rejects a
 * valid `None`-admin account; the size formula accepts that slack while still
 * rejecting genuine layout mismatches (which land a different total length).
 */
interface LayoutCandidate {
  variant: Variant;
  hasPendingAdmin: boolean;
  legacyCrankConfig: boolean;
}

const LAYOUT_CANDIDATES: LayoutCandidate[] = [
  { variant: "no-yield", hasPendingAdmin: true, legacyCrankConfig: false },
  { variant: "scaled-ui", hasPendingAdmin: true, legacyCrankConfig: false },
  { variant: "crank", hasPendingAdmin: true, legacyCrankConfig: false },
  { variant: "crank", hasPendingAdmin: true, legacyCrankConfig: true },
  { variant: "no-yield", hasPendingAdmin: false, legacyCrankConfig: false },
  { variant: "scaled-ui", hasPendingAdmin: false, legacyCrankConfig: false },
  { variant: "crank", hasPendingAdmin: false, legacyCrankConfig: false },
  { variant: "crank", hasPendingAdmin: false, legacyCrankConfig: true },
];

const VARIANT_TAG: Record<Variant, number> = { "no-yield": 0, "scaled-ui": 1, crank: 2 };

/** Serialized size of the YieldConfig struct (incl. its 1-byte variant tag), per generation. */
function yieldConfigSize(c: LayoutCandidate): number {
  if (c.variant === "no-yield") return 1; // yield_variant
  if (c.variant === "scaled-ui") return 1 + 8 + 8 + 8; // + fee_bps, last_m_index, last_ext_index
  if (c.legacyCrankConfig) return 1 + 32 + 8 + 8; // + earn_authority, index, timestamp
  return 1 + 32 + 8 + 8 + 8; // + earn_authority, last_m_index, last_ext_index, timestamp
}

/**
 * Account length the program allocates for a given generation with `n` wrap
 * authorities — mirrors `ExtGlobalV2::size()`. `pending_admin: Option<Pubkey>`
 * is reserved at its 33-byte maximum regardless of its current value.
 */
function expectedExtGlobalLen(c: LayoutCandidate, n: number): number {
  return (
    8 + // discriminator
    32 + // admin
    (c.hasPendingAdmin ? 1 + 32 : 0) + // pending_admin: Option<Pubkey>, reserved at max
    32 + 32 + 32 + // ext_mint, m_mint, m_earn_global_account
    1 + 1 + 1 + // bump, m_vault_bump, ext_mint_authority_bump
    yieldConfigSize(c) +
    4 + 32 * n // wrap_authorities: Vec<Pubkey>
  );
}

export interface DecodedExtGlobal {
  global: ExtGlobalV2;
  variant: Variant;
  /** human-readable note when the account uses an older struct generation */
  layoutNote: string | null;
}

function decodeExtGlobalWith(data: Buffer, c: LayoutCandidate): ExtGlobalV2 {
  const r = new Reader(data);
  const admin = r.pubkey();
  const pending_admin = c.hasPendingAdmin ? r.option(() => r.pubkey()) : null;
  const ext_mint = r.pubkey();
  const m_mint = r.pubkey();
  const m_earn_global_account = r.pubkey();
  const bump = r.u8();
  const m_vault_bump = r.u8();
  const ext_mint_authority_bump = r.u8();

  const variantByte = r.u8();
  if (variantByte !== VARIANT_TAG[c.variant]) {
    throw new RangeError(`variant tag ${variantByte} != expected ${VARIANT_TAG[c.variant]}`);
  }
  let yield_config: YieldConfigNoYield | YieldConfigScaledUi | YieldConfigCrank;
  if (c.variant === "no-yield") {
    yield_config = { yield_variant: variantByte };
  } else if (c.variant === "scaled-ui") {
    yield_config = {
      yield_variant: variantByte,
      fee_bps: r.u64(),
      last_m_index: r.u64(),
      last_ext_index: r.u64(),
    };
  } else if (c.legacyCrankConfig) {
    const earn_authority = r.pubkey();
    const index = r.u64();
    const timestamp = r.u64();
    yield_config = {
      yield_variant: variantByte,
      earn_authority,
      last_m_index: index,
      last_ext_index: index,
      timestamp,
    };
  } else {
    yield_config = {
      yield_variant: variantByte,
      earn_authority: r.pubkey(),
      last_m_index: r.u64(),
      last_ext_index: r.u64(),
      timestamp: r.u64(),
    };
  }

  const wrap_authorities = r.vec(() => r.pubkey(), 32);
  const expectedLen = expectedExtGlobalLen(c, wrap_authorities.length);
  if (data.length !== expectedLen) {
    throw new RangeError(
      `account length ${data.length} != allocated size ${expectedLen} for this layout (wrap_authorities=${wrap_authorities.length})`
    );
  }

  return {
    admin,
    pending_admin,
    ext_mint,
    m_mint,
    m_earn_global_account,
    bump,
    m_vault_bump,
    ext_mint_authority_bump,
    yield_config,
    wrap_authorities,
  };
}

export function decodeExtGlobalV2(data: Buffer): DecodedExtGlobal | null {
  for (const c of LAYOUT_CANDIDATES) {
    try {
      const global = decodeExtGlobalWith(data, c);
      const notes: string[] = [];
      if (!c.hasPendingAdmin) notes.push("no pending_admin field");
      if (c.legacyCrankConfig) notes.push("legacy crank YieldConfig (single index)");
      return {
        global,
        variant: c.variant,
        layoutNote: notes.length > 0 ? `older struct generation: ${notes.join(", ")}` : null,
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}
