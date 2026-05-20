# Solana Extension Inspector

CLI tool that produces a structured authority audit report for a pair of (Solana program, Token-2022 mint). Resolves every authority slot, classifies each holder (EOA, Squads multisig, SPL Governance, or other), and outputs a JSON report.

## Requirements

- Node.js 20+
- pnpm
- An RPC endpoint (e.g. Helius, QuickNode)

## Setup

```bash
pnpm install
```

## Usage

Set `RPC_URL` as an environment variable or inline it. Pass the program and mint pubkeys, then pipe the JSON output through `summarize.sh` for a human-readable summary.

```bash
EXPORT="audit.json" ; \
PROGRAM="<PROGRAM_PUBKEY>" ; \
MINT="<MINT_PUBKEY>" ; \
RPC_URL="<RPC_URL>" ; \
pnpm dev --program $PROGRAM --mint $MINT --out $EXPORT && \
./summarize.sh $EXPORT
```

### Example — WrappedM by M0

```bash
EXPORT="wrapped-m-audit.json" ; \
PROGRAM="wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko" ; \
MINT="mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp" ; \
RPC_URL=$(op read "op://Employee/Helius/prod rpc") ; \
pnpm dev --program $PROGRAM --mint $MINT --out $EXPORT && \
./summarize.sh $EXPORT
```
