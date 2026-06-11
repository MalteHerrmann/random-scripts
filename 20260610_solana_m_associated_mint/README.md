# Associated M Extension Mint

This script retrieves the associated token mint for any M extension on Solana.
Currently, this script does so for devnet accounts, but can be configured in the future to support alternative networks as well.

To showcase different ways of obtaining this information using varying approaches to either decoding or IDL parsing, there are different options implemented (-> `src/option[1,2,3].ts`).
Each slightly differs from the other ones to show alternate ways of working with existing or custom IDLs.

## Setup

It's required to install all dependencies, retrieve the M extension IDL from the GitHub repository (alternatively on-chain through `anchor idl fetch ...`), and build the corresponding typescript types.  
Once these requirements are satisfied, the program itself can be built:

```shell
pnpm install && \
pnpm get-idl && \
pnpm generate-types && \
pnpm build
```

## Usage

To run the program, pass a public key of an M extension program and the corresponding token mint will be read from the `ExtGlobalV2` struct, and printed to the terminal.

```shell
RPC_URL=$(op read "op://Solana Dev/Helius/dev rpc") && pnpm start [PROGRAM_ID]
```

**Note**, that it's required to rebuild the program when toggling between the different options.