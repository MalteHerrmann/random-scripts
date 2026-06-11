# m0-solana-inspector

Read-only CLI that inspects M0 Solana deployments and reports what is **deployed**, what is **wired**, and what is **missing**. Given a list of `m_ext` program IDs (or `--discover`), it reads on-chain state across the four programs of the suite — `portal`, `earn`, `m_ext`, `ext_swap` — plus the `$M` Token2022 mint, resolves every cross-program reference, and runs an invariant catalog over the result.

No keypairs needed; a single RPC endpoint is the only requirement.

## Usage

```bash
pnpm install

# inspect specific extensions
pnpm inspect devnet \
  --ext wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko \
  --ext mexteGyWXgUR65XepNKtLJ2H66MmyLWrDSeA1bqzZ4C

# or pull the extension list from on-chain registries (ext_swap whitelist + hyperlane metas)
pnpm inspect devnet --discover

# machine-readable / CI
pnpm inspect devnet --discover --json        # exit code = number of hard failures
pnpm inspect devnet --discover --graph      # appends a mermaid diagram of the resolved wiring

# overrides
pnpm inspect devnet --rpc https://devnet.helius-rpc.com/?api-key=… \
  --m-mint … --earn … --portal … --ext-swap …
```

`--ext` also accepts an extension's *global PDA* by mistake — it is resolved back to the owning program via the account owner.

## What it checks

**Core (C-checks)** — `$M` mint extensions and authorities (ScaledUiAmount/EarnGlobal, DefaultAccountState=Frozen, PermanentDelegate, mint authority = portal `["authority"]` PDA), EarnGlobal wiring (`m_mint`, `portal_authority`, `ext_swap_global_account`), earner merkle root presence + propagation freshness, PortalGlobal (m_mint, pause flags, bridge paths), adapter peers / Hyperlane ISM, hyperlane `AccountMetasData` ↔ ext_swap whitelist drift, `$M` multiplier sanity and staleness.

**Hub propagation (C9-checks)** — reads the EVM hub directly (Sepolia for devnet, plain `eth_call`, no extra deps): `$M.currentIndex()` and the Merkle Tree Builder's `getRoot("solana-earners")`. Reports how far Solana's index lags the hub in **bps and implied days** (via `ln(hub/solana) / earnerRate`), checks `PortalGlobal.m_index` consistency with the mint multiplier, and verifies merkle-root parity with the hub. Default-on; `--no-evm` skips, `--eth-rpc <url>` (or `ETH_RPC_URL`) overrides the public endpoint. Unreachable hub degrades to a tool warning.

**Per extension (E-checks)** — program deployed, `ExtGlobalV2` initialized + variant detection (`no-yield` / `scaled-ui` / `crank`), canonical `$M` and EarnGlobal references (the legacy earn global is flagged specially), ext mint authority = `["mint_authority"]` PDA (+ ScaledUiAmount for scaled-ui), `m_vault` ATA exists **and is thawed** (thawed = registered earner; `$M` defaults to Frozen), wrap authorities include the SwapGlobal PDA, ext_swap whitelist entry matches, variant-specific yield-sync freshness, bridge path + hyperlane metas registration, vault collateral ≥ ext supply.

Each failed check carries a remediation hint pointing at the existing CLI command or runbook that fixes it.

**Capability tiers** summarize each extension:

```
deployed ✔  initialized ✔  earner ✔  swappable ✘  bridgeable ✘
```

- *earner* — vault `$M` ATA thawed via `earn.add_registrar_earner` (merkle proof against the root bridged from the EVM hub)
- *swappable* — whitelisted in ext_swap **and** SwapGlobal PDA in the extension's wrap authorities (two-sided handshake)
- *bridgeable* — swappable **and** a portal `ChainBridgePaths` entry exists for the ext mint

## Architecture

```
src/index.ts    CLI (commander)
src/config.ts   canonical program IDs per network, PDA derivation helpers
src/resolve.ts  fetch + decode everything into a typed Graph (~3 batched RPC round trips)
src/decode.ts   bounds-checked borsh decoders for all account structs
src/token.ts    Token2022 mint/extension decoding (ScaledUiAmount, DefaultAccountState, …)
src/checks.ts   the invariant catalog (C*/E* findings + capability tiers)
src/report.ts   human / --json / --graph renderers
idls/           vendored IDLs (reference only — decoding is hand-written, see below)
```

### Why hand-written decoders instead of Anchor's coder

Deployed devnet programs predate the current source in places. Anchor's `BorshCoder` handles layout drift catastrophically: a misaligned `Vec` length reads as garbage and the decoder allocates unbounded memory (real case: the devnet wM global OOM'd the process). The decoders in `decode.ts` bounds-check every read and validate candidate layouts by exact-consumption-modulo-zero-tail (Anchor reserves max space for `Option<…>`, so an all-zero tail is normal).

`ExtGlobalV2` is decoded against multiple **layout generations** (with/without `pending_admin`; modern vs legacy crank `YieldConfig`), which is also how the variant is detected — the generation that decodes cleanly with a matching variant tag wins. Devnet wM, for example, still runs the legacy crank layout and is reported as such.

### Known limitations

- The deployed devnet **hyperlane adapter** uses an older `HyperlaneGlobal` layout (123 bytes) that doesn't match current `m-portal-v2` source; it is reported as "exists but undecodable" rather than decoded. Vendor its old layout in `decode.ts` if you need its fields.
- Bridge-path enumeration needs `getProgramAccounts`; on RPCs where it's disabled the E10 checks are skipped (a tool warning says so).
- The hub cross-check covers index drift and merkle-root parity (C9.*), but not per-vault membership in the hub's earner *list* (`getList("solana-earners")`) — adding that would explain *why* an E6 (vault frozen) failure exists.

## Canonical devnet addresses (baked into `config.ts`)

| Component | Address |
|---|---|
| `$M` mint | `mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH` |
| earn program | `mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z` |
| EarnGlobal PDA | `CQNpruTHcw9QLfCG3gPaLQsFSqNz5XdtJzRDNWoSv3bZ` |
| portal | `MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce` |
| wormhole adapter | `mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY` |
| hyperlane adapter | `mZhPGteS36G7FhMTcRofLQU8ocBNAsGq7u8SKSHfL2X` |
| ext_swap | `MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH` |
| SwapGlobal PDA | `6U4ZZZkftbuHxjRDHUfh83M9zG66aAAXDV3xTRX7yePr` |

Program IDs are identical on mainnet (separate state); `pnpm inspect mainnet` works with the same config.
