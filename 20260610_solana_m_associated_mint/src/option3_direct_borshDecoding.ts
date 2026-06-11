import { BorshAccountsCoder, web3 } from "@coral-xyz/anchor";
import { minimalIDL } from "./option2_minimal_idl.js";

export async function option3(
    connection: web3.Connection,
    globalPubkey: web3.PublicKey
) {
    const account = await connection.getAccountInfo(globalPubkey);
    const decoder = new BorshAccountsCoder(minimalIDL);

    if (account === null) {
        console.error("global account not found");
        process.exit(1);
    }

    // Decode the account's data by specifying the output data structure we require.
    const { extMint } = decoder.decode("ExtGlobalV2", account.data) as { extMint: web3.PublicKey };
    console.log("Token mint: ", extMint.toString());
}