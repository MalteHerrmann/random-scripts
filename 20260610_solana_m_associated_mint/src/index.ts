import { web3 } from "@coral-xyz/anchor";
import { option1 } from "./option1.js";
import { option2 } from "./option2_minimal_idl.js";
import { option3 } from "./option3_direct_borshDecoding.js";

async function main() {
    if (process.argv.length !== 3) {
        console.error("Exactly one argument required: public key of the M extension program");
        process.exit(1);
    }

    let programID: web3.PublicKey;
    try {
        programID = new web3.PublicKey(process.argv[2]);
    } catch {
        console.error("Invalid public key:", process.argv[2]);
        process.exit(1);
    }

    const [globalPubkey] = web3.PublicKey.findProgramAddressSync([Buffer.from("global")], programID);
    console.log("global PDA: ", globalPubkey.toString());

    // Create connection to configured network.
    const rpc_url = process.env["RPC_URL"] as string;
    console.log("RPC URL: ", rpc_url);
    const connection = new web3.Connection(rpc_url, "confirmed");

    // Here are the different options of running the script:
    // await option1(connection, programID, globalPubkey);
    // await option2(connection, programID, globalPubkey);
    await option3(connection, globalPubkey);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
})
