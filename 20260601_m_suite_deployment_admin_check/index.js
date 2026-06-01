import { createPublicClient, http, isAddress, getAddress } from 'viem';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_ADMIN_ROLE = `0x${'00'.repeat(32)}`;

const HAS_ROLE_ABI = [
  {
    name: 'hasRole',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

function usage() {
  console.error('Usage: node index.js <chainId> <rpcUrl> <authorityAddress>');
  console.error('  chainId          — numeric chain ID (e.g. 1 for Ethereum mainnet)');
  console.error('  rpcUrl           — HTTP RPC endpoint');
  console.error('  authorityAddress — address expected to hold DEFAULT_ADMIN_ROLE');
  process.exit(1);
}

const [, , chainIdArg, rpcUrl, authorityArg] = process.argv;

if (!chainIdArg || !rpcUrl || !authorityArg) usage();
if (!isAddress(authorityArg)) {
  console.error(`Invalid authority address: ${authorityArg}`);
  usage();
}

const authority = getAddress(authorityArg);
const chainId = Number(chainIdArg);
if (!Number.isInteger(chainId) || chainId <= 0) {
  console.error(`Invalid chain ID: ${chainIdArg}`);
  usage();
}

const deploymentsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../deployments',
  `${chainId}.json`,
);

let deployments;
try {
  deployments = JSON.parse(readFileSync(deploymentsPath, 'utf8'));
} catch {
  console.error(`Could not read deployments file: ${deploymentsPath}`);
  process.exit(1);
}

const client = createPublicClient({
  transport: http(rpcUrl),
  batch: { multicall: true },
});

const entries = Object.entries(deployments);

console.log(`\nChecking DEFAULT_ADMIN_ROLE for chain ${chainId}`);
console.log(`Authority: ${authority}`);
console.log(`Contracts: ${entries.length}\n`);

const results = await Promise.allSettled(
  entries.map(([name, rawAddress]) => {
    if (!isAddress(rawAddress)) return Promise.reject({ name, reason: 'invalid-address' });
    const address = getAddress(rawAddress);
    if (address === ZERO_ADDRESS) return Promise.resolve({ name, address, status: 'skipped' });

    return client
      .readContract({
        address,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [DEFAULT_ADMIN_ROLE, authority],
      })
      .then((hasRole) => ({ name, address, status: hasRole ? 'ok' : 'fail' }));
  }),
);

let failCount = 0;
let okCount = 0;
let naCount = 0;
let skippedCount = 0;

for (const result of results) {
  if (result.status === 'fulfilled') {
    const { name, address, status } = result.value;
    if (status === 'skipped') {
      console.log(`  ⊘  ${name.padEnd(20)} ${address}  (zero address — skipped)`);
      skippedCount++;
    } else if (status === 'ok') {
      console.log(`  ✓  ${name.padEnd(20)} ${address}`);
      okCount++;
    } else {
      console.log(`  ✗  ${name.padEnd(20)} ${address}  ← FAIL: authority does not hold DEFAULT_ADMIN_ROLE`);
      failCount++;
    }
  } else {
    // Rejected — either not AccessControl or RPC error; extract name from entries
    const idx = results.indexOf(result);
    const [name, rawAddress] = entries[idx];
    const label = isAddress(rawAddress) ? getAddress(rawAddress) : rawAddress;
    console.log(`  –  ${name.padEnd(20)} ${label}  (no DEFAULT_ADMIN_ROLE / not AccessControl)`);
    naCount++;
  }
}

console.log(
  `\nSummary: ${okCount} OK  |  ${failCount} FAIL  |  ${naCount} N/A  |  ${skippedCount} skipped`,
);

if (failCount > 0) process.exit(1);
