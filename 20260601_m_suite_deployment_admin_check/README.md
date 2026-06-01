# Admin Check

This script enables easily checking the expected admin accounts on a given M0 suite deployment on an EVM chain.
The implementation assumes the structure present in https://github.com/m0-foundation/evm-m-suite-deployment and parses the contained deployment JSON files for the corresponding contract addresses.

## Requirements

- `pnpm`

## Setup

Install the required packages using:

```shell
pnpm install
```

## Usage

Run the tool by passing the desired chain ID (which corresponds to the JSON files containing the deployed contract addresses), as well as the RPC URL and the expected admin address:

```
node index.js [chainId] [rpc-url] [expected address]
```


As an example for e.g. Fluent:

```shell
node index.js 25363 https://rpc.fluent.xyz 0x...
```
