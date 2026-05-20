import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
  getExtensionData,
  getTransferFeeConfig,
  getMintCloseAuthority,
  getPermanentDelegate,
  getInterestBearingMintConfigState,
  getDefaultAccountState,
  getTransferHook,
  getMetadataPointerState,
  getGroupPointerState,
  getGroupMemberPointerState,
  getTokenMetadata,
  getPausableConfig,
  getScaledUiAmountConfig,
  getTokenGroupState,
  getTokenGroupMemberState,
} from "@solana/spl-token";
import type { AuthorityHolder, ExtensionInfo, MintInfo } from "../types.js";

// OptionalNonZeroPubkey: 32 bytes — all zeros means None
function parseOptionalPubkey(data: Buffer, offset = 0): string | null {
  const slice = data.slice(offset, offset + 32);
  if (slice.every((b) => b === 0)) return null;
  return new PublicKey(slice).toBase58();
}

export async function getMintInfo(
  conn: Connection,
  mintAddress: PublicKey,
  classifyFn: (pubkey: string | null) => Promise<AuthorityHolder>
): Promise<MintInfo> {
  const rawAccount = await conn.getAccountInfo(mintAddress);
  if (!rawAccount) {
    throw new Error(`Mint account not found: ${mintAddress.toBase58()}`);
  }
  if (!rawAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      `Mint ${mintAddress.toBase58()} is not owned by Token-2022 program ` +
        `(owner: ${rawAccount.owner.toBase58()}).`
    );
  }

  const mint = await getMint(conn, mintAddress, "confirmed", TOKEN_2022_PROGRAM_ID);

  const [mintAuthority, freezeAuthority] = await Promise.all([
    classifyFn(mint.mintAuthority?.toBase58() ?? null),
    classifyFn(mint.freezeAuthority?.toBase58() ?? null),
  ]);

  // Enumerate every extension type present so nothing is silently skipped
  const presentTypes = new Set(getExtensionTypes(mint.tlvData));
  const extensions: ExtensionInfo[] = [];

  // Track which types we handle explicitly so we can catch unhandled ones at the end
  const handled = new Set<ExtensionType>();

  const handle = (type: ExtensionType, ext: ExtensionInfo | null) => {
    handled.add(type);
    if (ext) extensions.push(ext);
  };

  if (presentTypes.has(ExtensionType.TransferFeeConfig)) {
    const cfg = getTransferFeeConfig(mint);
    if (cfg) {
      const [transferFeeConfigAuthority, withdrawWithheldAuthority] = await Promise.all([
        classifyFn(cfg.transferFeeConfigAuthority?.toBase58() ?? null),
        classifyFn(cfg.withdrawWithheldAuthority?.toBase58() ?? null),
      ]);
      handle(ExtensionType.TransferFeeConfig, {
        type: "TransferFeeConfig",
        transferFeeConfigAuthority,
        withdrawWithheldAuthority,
        olderTransferFee: cfg.olderTransferFee,
        newerTransferFee: cfg.newerTransferFee,
      });
    } else {
      handle(ExtensionType.TransferFeeConfig, null);
    }
  }

  if (presentTypes.has(ExtensionType.MintCloseAuthority)) {
    const ext = getMintCloseAuthority(mint);
    handle(ExtensionType.MintCloseAuthority, ext
      ? { type: "MintCloseAuthority", authority: await classifyFn(ext.closeAuthority?.toBase58() ?? null) }
      : null);
  }

  if (presentTypes.has(ExtensionType.PermanentDelegate)) {
    const ext = getPermanentDelegate(mint);
    handle(ExtensionType.PermanentDelegate, ext
      ? { type: "PermanentDelegate", delegate: await classifyFn(ext.delegate?.toBase58() ?? null) }
      : null);
  }

  if (presentTypes.has(ExtensionType.InterestBearingConfig)) {
    const ext = getInterestBearingMintConfigState(mint);
    handle(ExtensionType.InterestBearingConfig, ext
      ? { type: "InterestBearingConfig", rateAuthority: await classifyFn(ext.rateAuthority?.toBase58() ?? null), currentRate: ext.currentRate }
      : null);
  }

  if (presentTypes.has(ExtensionType.DefaultAccountState)) {
    const ext = getDefaultAccountState(mint);
    handle(ExtensionType.DefaultAccountState, ext
      ? { type: "DefaultAccountState", state: ext.state }
      : null);
  }

  if (presentTypes.has(ExtensionType.TransferHook)) {
    const ext = getTransferHook(mint);
    handle(ExtensionType.TransferHook, ext
      ? { type: "TransferHook", authority: await classifyFn(ext.authority?.toBase58() ?? null), programId: ext.programId?.toBase58() ?? null }
      : null);
  }

  if (presentTypes.has(ExtensionType.MetadataPointer)) {
    const ext = getMetadataPointerState(mint);
    handle(ExtensionType.MetadataPointer, ext
      ? { type: "MetadataPointer", authority: await classifyFn(ext.authority?.toBase58() ?? null), metadataAddress: ext.metadataAddress?.toBase58() ?? null }
      : null);
  }

  if (presentTypes.has(ExtensionType.GroupPointer)) {
    const ext = getGroupPointerState(mint);
    handle(ExtensionType.GroupPointer, ext
      ? { type: "GroupPointer", authority: await classifyFn(ext.authority?.toBase58() ?? null), groupAddress: ext.groupAddress?.toBase58() ?? null }
      : null);
  }

  if (presentTypes.has(ExtensionType.GroupMemberPointer)) {
    const ext = getGroupMemberPointerState(mint);
    handle(ExtensionType.GroupMemberPointer, ext
      ? { type: "GroupMemberPointer", authority: await classifyFn(ext.authority?.toBase58() ?? null), memberAddress: ext.memberAddress?.toBase58() ?? null }
      : null);
  }

  if (presentTypes.has(ExtensionType.TokenMetadata)) {
    // getTokenMetadata is async — fetches from chain
    const ext = await getTokenMetadata(conn, mintAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
    handle(ExtensionType.TokenMetadata, ext
      ? { type: "TokenMetadata", updateAuthority: await classifyFn(ext.updateAuthority?.toBase58() ?? null), mint: ext.mint?.toBase58() ?? null, name: ext.name, symbol: ext.symbol, uri: ext.uri }
      : null);
  }

  if (presentTypes.has(ExtensionType.PausableConfig)) {
    const ext = getPausableConfig(mint);
    handle(ExtensionType.PausableConfig, ext
      ? { type: "PausableConfig", authority: await classifyFn(ext.authority?.toBase58() ?? null) }
      : null);
  }

  if (presentTypes.has(ExtensionType.ScaledUiAmountConfig)) {
    const ext = getScaledUiAmountConfig(mint);
    handle(ExtensionType.ScaledUiAmountConfig, ext
      ? { type: "ScaledUiAmountConfig", authority: await classifyFn(ext.authority?.toBase58() ?? null) }
      : null);
  }

  if (presentTypes.has(ExtensionType.TokenGroup)) {
    const ext = getTokenGroupState(mint);
    handle(ExtensionType.TokenGroup, ext
      ? { type: "TokenGroup", updateAuthority: await classifyFn(ext.updateAuthority?.toBase58() ?? null), mint: ext.mint?.toBase58() ?? null, size: ext.size?.toString() ?? null, maxSize: ext.maxSize?.toString() ?? null }
      : null);
  }

  if (presentTypes.has(ExtensionType.TokenGroupMember)) {
    const ext = getTokenGroupMemberState(mint);
    handle(ExtensionType.TokenGroupMember, ext
      ? { type: "TokenGroupMember", mint: ext.mint?.toBase58() ?? null, group: ext.group?.toBase58() ?? null, memberNumber: ext.memberNumber?.toString() ?? null }
      : null);
  }

  // ConfidentialTransferMint: not exported by spl-token 0.4.x — parse raw TLV bytes manually.
  // Layout: authority (OptionalNonZeroPubkey, 32 bytes) | auto_approve_new_accounts (bool, 1 byte) | auditor_elgamal_pubkey (32 bytes)
  if (presentTypes.has(ExtensionType.ConfidentialTransferMint)) {
    handled.add(ExtensionType.ConfidentialTransferMint);
    const raw = getExtensionData(ExtensionType.ConfidentialTransferMint, mint.tlvData);
    if (raw) {
      const authority = parseOptionalPubkey(Buffer.from(raw), 0);
      const autoApproveNewAccounts = raw[32] === 1;
      extensions.push({
        type: "ConfidentialTransferMint",
        authority: await classifyFn(authority),
        autoApproveNewAccounts,
        auditorElgamalPubkey: Buffer.from(raw.slice(33, 65)).toString("hex"),
      });
    }
  }

  // Catch-all: any extension type present but not explicitly handled above
  for (const extType of presentTypes) {
    if (handled.has(extType)) continue;
    // Skip account-side-only extension types that appear on mint accounts incidentally
    if (extType === ExtensionType.Uninitialized) continue;

    const typeName = ExtensionType[extType] ?? `Unknown(${extType})`;
    const raw = getExtensionData(extType, mint.tlvData);
    extensions.push({
      type: typeName,
      rawHex: raw ? Buffer.from(raw).toString("hex") : null,
    });
  }

  return {
    address: mintAddress.toBase58(),
    tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
    decimals: mint.decimals,
    supply: mint.supply.toString(),
    mintAuthority,
    freezeAuthority,
    extensions,
  };
}
