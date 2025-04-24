from web3 import Web3
import json
import os
from eth_account import Account
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Web3
# Replace with your node's RPC URL
w3 = Web3(Web3.HTTPProvider(os.getenv('RPC_URL', 'http://localhost:8545')))

def create_and_sign_transaction(private_key, to_address, value_eth, gas_limit=21000, gas_price=None):
    """
    Create and sign a transaction that can be replayed multiple times.
    
    Args:
        private_key (str): Private key of the sender
        to_address (str): Recipient address
        value_eth (float): Amount to send in ETH
        gas_limit (int): Gas limit for the transaction
        gas_price (int): Gas price in wei (if None, will be fetched from network)
    
    Returns:
        dict: Signed transaction ready to be sent
    """
    # Convert private key to account
    account = Account.from_key(private_key)
    
    # Get nonce
    nonce = w3.eth.get_transaction_count(account.address)
    
    # Convert ETH to Wei
    value_wei = w3.to_wei(value_eth, 'ether')
    
    # Get current gas price if not provided
    if gas_price is None:
        gas_price = w3.eth.gas_price
    
    # Build transaction
    transaction = {
        'nonce': nonce,
        'to': to_address,
        'value': value_wei,
        'gas': gas_limit,
        'gasPrice': gas_price,
        'chainId': w3.eth.chain_id
    }
    
    # Sign transaction
    signed_tx = w3.eth.account.sign_transaction(transaction, private_key)
    
    return signed_tx.rawTransaction

def send_transaction(signed_tx):
    """
    Send a signed transaction to the network.
    
    Args:
        signed_tx (bytes): Raw signed transaction
    
    Returns:
        str: Transaction hash
    """
    tx_hash = w3.eth.send_raw_transaction(signed_tx)
    return tx_hash.hex()

def main():
    # Load private key from environment variable
    private_key = os.getenv('PRIVATE_KEY')
    if not private_key:
        raise ValueError("Please set PRIVATE_KEY in your .env file")
    
    # Example recipient address (replace with your target address)
    to_address = os.getenv('TO_ADDRESS', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e')
    
    # Amount to send in ETH
    value_eth = 0.00000001
    
    # Create and sign the transaction
    print("Creating and signing transaction...")
    signed_tx = create_and_sign_transaction(private_key, to_address, value_eth)
    
    # Send the same transaction three times
    for i in range(3):
    # i = 1
        print(f"\nSending transaction attempt {i+1}...")
        tx_hash = send_transaction(signed_tx)
        print(f"Transaction hash: {tx_hash}")
        
        # Wait for transaction receipt
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"Transaction status: {'Success' if receipt.status == 1 else 'Failed'}")
        print(f"Block number: {receipt.blockNumber}")

if __name__ == "__main__":
    main()
