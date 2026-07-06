# Account Spending Tracker

Simple TypeScript script to summarise recent Ethereum mainnet spending for an address.
Reports total gas fees and outgoing ETH value, either for the last N transactions or the last N days.

## Setup

```shell
pnpm install
cp .env.example .env   # then fill in your Etherscan API key
```

## Usage

Last N transactions:

```shell
pnpm start -- --address <0x…> --count 20
```

Transactions from the last N days:

```shell
pnpm start -- --address <0x…> --days 30
```

Add `--verbose` to print a per-transaction breakdown.
The Etherscan API key can also be passed directly with `--api-key <key>` instead of via the env file.
