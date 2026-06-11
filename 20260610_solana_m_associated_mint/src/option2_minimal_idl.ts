import { AnchorProvider, Program, web3, type Idl } from "@coral-xyz/anchor";

// Minimal layout: only the prefix up to the field we read. Everything after
// extMint (mMint, yieldConfig, wrapAuthorities, ...) is deliberately omitted,
// so decoding never reaches the variable-size wrap_authorities vec that made
// the full/old IDL blow up. Borsh decodes positionally and ignores trailing bytes.
//
// A hand-built literal can't be inferred as `Idl` (TS widens "struct"/"pubkey"
// to `string`), so we cast it - which is also why we lose typed account access.
export const minimalIDL = {
    address: "11111111111111111111111111111111", // overridden per-call below
    metadata: { name: "m_ext", version: "0.0.0", spec: "0.1.0" },
    instructions: [],
    accounts: [{ name: "ExtGlobalV2", discriminator: [116, 209, 219, 83, 70, 143, 55, 127] }],
    types: [{
        name: "ExtGlobalV2",
        type: {
            kind: "struct", fields: [
                { name: "admin", type: "pubkey" },
                { name: "pendingAdmin", type: { option: "pubkey" } },
                { name: "extMint", type: "pubkey" },
            ],
        },
    }],
} as unknown as Idl;

// We only read extMint, so we describe just that field of the decoded result.
type ExtGlobalPrefix = { extMint: web3.PublicKey };

export async function option2(
    connection: web3.Connection,
    programID: web3.PublicKey,
    globalPubkey: web3.PublicKey
) {
    const provider = new AnchorProvider(connection, {} as any);
    const program = new Program({ ...minimalIDL, address: programID.toBase58() } as Idl, provider);

    // Same as option1: the generic IDL means the account namespace isn't
    // statically aware of extGlobalV2, so we reach it dynamically and cast.
    const extGlobal = (program.account as any).extGlobalV2;
    const globalState = (await extGlobal.fetch(globalPubkey)) as ExtGlobalPrefix;
    console.log("Token mint:", globalState.extMint.toBase58());
}
