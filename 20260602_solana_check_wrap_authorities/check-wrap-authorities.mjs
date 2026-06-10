// Read-only: print the wrap authorities (and key config) of an m_ext extension.
//
// On Solana there is no "view call" like EVM's `cast call ... "wrapAuthorities"`.
// State lives in accounts: we fetch the extension's `ExtGlobalV2` account (PDA
// seeds = ["global"]) and decode the `wrap_authorities` field out of its bytes.
//
// Usage:
//   node check-wrap-authorities.mjs [EXTENSION_PROGRAM_ID] [--signer <PUBKEY>]
//
// Env:
//   RPC_URL   RPC endpoint (default: https://api.devnet.solana.com)
//
// Examples:
//   node check-wrap-authorities.mjs
//   node check-wrap-authorities.mjs mexteGyWXgUR65XepNKtLJ2H66MmyLWrDSeA1bqzZ4C
//   node check-wrap-authorities.mjs --signer <yourPubkey>
//   RPC_URL=https://my-helius-url node check-wrap-authorities.mjs

import { Connection, PublicKey } from "@solana/web3.js";

// ---- args / config -------------------------------------------------------
const DEFAULT_PROGRAM = "mexteGyWXgUR65XepNKtLJ2H66MmyLWrDSeA1bqzZ4C"; // devnet extension
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

const argv = process.argv.slice(2);
let programIdStr = DEFAULT_PROGRAM;
let signerStr = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--signer") {
    signerStr = argv[++i];
  } else if (!argv[i].startsWith("--")) {
    programIdStr = argv[i];
  }
}

const VARIANT_NAMES = ["NoYield", "ScaledUi", "Crank"];
// yield_config serialized size per variant (see programs/m_ext/src/state/mod.rs)
const YIELD_CONFIG_SIZE = {
  0: 1, // NoYield:  variant(1)
  1: 25, // ScaledUi: variant(1) + fee_bps(8) + last_m_index(8) + last_ext_index(8)
  2: 57, // Crank:    variant(1) + earn_authority(32) + last_m(8) + last_ext(8) + timestamp(8)
};

function pk(buf, offset) {
  return new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
}

async function main() {
  const programId = new PublicKey(programIdStr);
  const connection = new Connection(RPC_URL, "confirmed");

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId,
  );

  console.log(`RPC:           ${RPC_URL}`);
  console.log(`Extension:     ${programId.toBase58()}`);
  console.log(`Global PDA:    ${globalPda.toBase58()}`);
  console.log("");

  const info = await connection.getAccountInfo(globalPda);
  if (!info) {
    console.error(
      `ERROR: no global account found at ${globalPda.toBase58()}.\n` +
        `       Is the extension initialized on this cluster? (RPC=${RPC_URL})`,
    );
    process.exit(1);
  }
  const data = info.data;

  // ---- decode ExtGlobalV2 manually (variant-aware) ----------------------
  // Layout (see programs/m_ext/src/state/mod.rs):
  //   8   discriminator
  //   32  admin
  //   1(+32) pending_admin: Option<Pubkey>  -> tag byte at offset 40
  //   32  ext_mint
  //   32  m_mint
  //   32  m_earn_global_account
  //   1   bump
  //   1   m_vault_bump
  //   1   ext_mint_authority_bump
  //   ..  yield_config (size depends on variant; first byte is the variant)
  //   4   wrap_authorities length (u32 LE)
  //   N*32 wrap_authorities pubkeys
  const admin = pk(data, 8);
  const pendingTag = data[40];
  const hasPending = pendingTag === 1;
  const pendingAdmin = hasPending ? pk(data, 41) : null;

  let o = 41 + (hasPending ? 32 : 0); // start of ext_mint
  const extMint = pk(data, o);
  o += 32;
  const mMint = pk(data, o);
  o += 32;
  const mEarnGlobal = pk(data, o);
  o += 32;
  o += 3; // three bump bytes

  const variantByte = data[o]; // first byte of yield_config
  const variantName = VARIANT_NAMES[variantByte] ?? `Unknown(${variantByte})`;
  const ycSize = YIELD_CONFIG_SIZE[variantByte];
  if (ycSize === undefined) {
    console.error(`ERROR: unknown yield variant byte ${variantByte}`);
    process.exit(1);
  }
  o += ycSize; // start of wrap_authorities vec

  const count = data.readUInt32LE(o);
  o += 4;
  const wrapAuthorities = [];
  for (let i = 0; i < count; i++) {
    wrapAuthorities.push(pk(data, o));
    o += 32;
  }

  // ---- report -----------------------------------------------------------
  console.log(`admin:         ${admin}`);
  console.log(`pending admin: ${pendingAdmin ?? "(none)"}`);
  console.log(`variant:       ${variantName}`);
  console.log(`m_mint:        ${mMint}`);
  console.log(`ext_mint:      ${extMint}`);
  console.log(`m_earn_global: ${mEarnGlobal}`);
  console.log("");
  console.log(`wrap_authorities (${count}):`);
  for (const a of wrapAuthorities) {
    const tag = a === admin ? "  <- admin" : "";
    console.log(`  - ${a}${tag}`);
  }

  if (signerStr) {
    const ok = wrapAuthorities.includes(signerStr);
    console.log("");
    console.log(
      ok
        ? `✅ ${signerStr} IS a wrap authority — it can sign wrap().`
        : `❌ ${signerStr} is NOT a wrap authority — wrap() would fail with NotAuthorized.`,
    );
    process.exit(ok ? 0 : 2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
