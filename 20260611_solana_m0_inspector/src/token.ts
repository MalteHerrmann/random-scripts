import { AccountInfo, PublicKey } from "@solana/web3.js";
import {
  AccountState,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getExtensionData,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import { AtaState, MintInfo, ScaledUiAmountConfig } from "./types.js";

// ScaledUiAmountConfig landed in recent spl-token versions; fall back to the
// raw Token2022 extension type id if the enum member is missing.
const SCALED_UI_AMOUNT_EXT: ExtensionType =
  (ExtensionType as Record<string, unknown>)["ScaledUiAmountConfig"] !== undefined
    ? (ExtensionType as unknown as Record<string, ExtensionType>)["ScaledUiAmountConfig"]
    : (25 as ExtensionType);

const ZERO_PUBKEY = new PublicKey(new Uint8Array(32));

function nonZero(pk: PublicKey): PublicKey | null {
  return pk.equals(ZERO_PUBKEY) ? null : pk;
}

/** authority(32) | multiplier f64 | new_multiplier_effective_timestamp i64 | new_multiplier f64 */
function decodeScaledUiAmount(data: Buffer): ScaledUiAmountConfig {
  return {
    authority: nonZero(new PublicKey(data.subarray(0, 32))),
    multiplier: data.readDoubleLE(32),
    newMultiplierEffectiveTimestamp: Number(data.readBigInt64LE(40)),
    newMultiplier: data.readDoubleLE(48),
  };
}

export function decodeMint(address: PublicKey, info: AccountInfo<Buffer>): MintInfo {
  const tokenProgram = info.owner;
  const mint = unpackMint(address, info, tokenProgram);

  let scaledUiAmount: ScaledUiAmountConfig | null = null;
  let defaultAccountState: MintInfo["defaultAccountState"] = null;
  let permanentDelegate: PublicKey | null = null;

  if (tokenProgram.equals(TOKEN_2022_PROGRAM_ID) && mint.tlvData.length > 0) {
    const scaled = getExtensionData(SCALED_UI_AMOUNT_EXT, mint.tlvData);
    if (scaled) scaledUiAmount = decodeScaledUiAmount(scaled);

    const das = getExtensionData(ExtensionType.DefaultAccountState, mint.tlvData);
    if (das && das.length >= 1) {
      defaultAccountState = das[0] === AccountState.Frozen ? "frozen" : "initialized";
    }

    const pd = getExtensionData(ExtensionType.PermanentDelegate, mint.tlvData);
    if (pd && pd.length >= 32) permanentDelegate = nonZero(new PublicKey(pd.subarray(0, 32)));
  }

  return {
    address,
    tokenProgram,
    decimals: mint.decimals,
    supply: mint.supply,
    mintAuthority: mint.mintAuthority,
    freezeAuthority: mint.freezeAuthority,
    scaledUiAmount,
    defaultAccountState,
    permanentDelegate,
  };
}

export function decodeTokenAccountState(
  address: PublicKey,
  info: AccountInfo<Buffer> | null
): { state: AtaState; amount: bigint } {
  if (!info) return { state: "missing", amount: 0n };
  const acc = unpackAccount(address, info, info.owner);
  return { state: acc.isFrozen ? "frozen" : "initialized", amount: acc.amount };
}

export function uiAmount(raw: bigint, decimals: number, multiplier = 1): number {
  return (Number(raw) / 10 ** decimals) * multiplier;
}

export function tokenProgramName(pk: PublicKey): string {
  if (pk.equals(TOKEN_2022_PROGRAM_ID)) return "Token2022";
  if (pk.equals(TOKEN_PROGRAM_ID)) return "SPL Token";
  return pk.toBase58();
}
