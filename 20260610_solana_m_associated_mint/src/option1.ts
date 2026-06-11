import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";

export async function option1(
    connection: web3.Connection,
    programID: web3.PublicKey,
    globalPubkey: web3.PublicKey
) {
    // As we're only doing reads here, the wallet can be left empty by passing {}.
    const provider = new AnchorProvider(connection, {} as any);

    // Fetch the IDL straight from the deployed program. M extensions are compiled
    // per yield variant, so each deployment has its own account layout - using the
    // on-chain IDL guarantees the layout matches the data we decode.
    const program = await Program.at(programID, provider);
    if (!program) {
        console.error("No on-chain IDL published for program:", programID.toBase58());
        process.exit(1);
    }

    // Program.at returns a generically-typed program, so the account namespace
    // isn't statically aware of extGlobalV2 - reach it dynamically.
    const extGlobal = (program.account as any).extGlobalV2;
    const globalState = (await extGlobal.fetch(globalPubkey)) as { extMint: web3.PublicKey };
    console.log("Token mint:", globalState.extMint.toBase58());

    return;
}