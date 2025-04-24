# Duplicate Transaction Tester

A tool to test duplicate transactions on EVM-compatible blockchains.

## Setup with uv

1. Install `uv` if you haven't already:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. Create a virtual environment and install dependencies:
```bash
# Create a virtual environment
uv venv

# Activate the virtual environment
source .venv/bin/activate  # On Unix/macOS

# Install dependencies
uv pip install -e .
```

3. Create a `.env` file with your configuration:
```bash
# # SagaEVM Staging
# RPC_URL=https://sagaevm-54647357-1.jsonrpc.staging-srv.sagarpc.io
# SagaEVM Testnet
RPC_URL=https://sagaevm-54647357-1.jsonrpc.testnet.sagarpc.io

# Your private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Optional: Recipient address (defaults to example address if not set)
TO_ADDRESS=0x0AA1012D993e497682B7e451AAF781F2C86945f7
```

4. Run the script:
```bash
python runDuplicateTx.py
```

## Project Structure

- `runDuplicateTx.py`: Main script for creating and sending duplicate transactions
- `pyproject.toml`: Project configuration and dependencies
- `.env`: Environment variables (not tracked in git)
- `.env.example`: Example environment variables file

## Features

- Creates and signs Ethereum transactions
- Sends the same signed transaction multiple times
- Waits for transaction confirmation
- Uses environment variables for sensitive data
- Supports custom RPC endpoints 
