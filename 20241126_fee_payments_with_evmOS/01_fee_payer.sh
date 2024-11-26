# This file contains the required logic to test the flow of providing fee payments for another account by using the `fee_payer` field
# in a Cosmos message (check here: https://github.com/evmos/cosmos-sdk/blob/v0.50.9-evmos/types/tx_msg.go#L59-L66).

set -e

# ---------
# 0. Save some helper variables
CHAINID="os_9005-1"
OSDHOME="$HOME/.osd"
KEYRING="test"
NODE="http://localhost:26657"
GRANTER=$(osd keys show -a dev0 --home $OSDHOME --keyring-backend $KEYRING)
GRANTEE=$(osd keys show -a dev1 --home $OSDHOME --keyring-backend $KEYRING)
RECEIVER=$(osd keys show -a dev2 --home $OSDHOME --keyring-backend $KEYRING)
echo "granter: $GRANTER"
echo "grantee: $GRANTEE"
echo "receiver: $RECEIVER"

# ---------
# 0.5 Query user balances before
GRANTEE_BEFORE=$(osd q bank balances "$GRANTEE" --node "$NODE" -o json | jq -r '.balances[0].amount')
GRANTER_BEFORE=$(osd q bank balances "$GRANTER" --node "$NODE" -o json | jq -r '.balances[0].amount')
RECEIVER_BEFORE=$(osd q bank balances "$RECEIVER" --node "$NODE" -o json | jq -r '.balances[0].amount')

# ---------
# 1. Create the unsigned transaction, that is specifying the fee payer
osd tx bank send dev1 "$RECEIVER" 2500000000000000000aevmos \
  --from dev1 \
  --fee-payer "$GRANTER" \
  --home "$OSDHOME" \
  --node "$NODE" \
  --keyring-backend "$KEYRING" \
  --fees 200000000000000aevmos \
  --gas 250000 \
  --chain-id "$CHAINID" \
  --generate-only >unsigned_tx.json

# ---------
# 2. Sign with grantee (first signature)
osd tx sign unsigned_tx.json \
  --from "$GRANTEE" \
  --home "$OSDHOME" \
  --keyring-backend "$KEYRING" \
  --chain-id "$CHAINID" \
  --sign-mode amino-json >partial_tx_1.json

# ---------
# 3. Sign with fee-payer (second signature)
osd tx sign partial_tx_1.json \
  --from "$GRANTER" \
  --home "$OSDHOME" \
  --keyring-backend "$KEYRING" \
  --chain-id "$CHAINID" \
  --sign-mode amino-json >signed_tx.json

# ---------
# 4. Broadcast the transaction
TXHASH=$(osd tx broadcast signed_tx.json \
  --node "$NODE" \
  --chain-id "$CHAINID" \
  --output json | jq -r '.txhash')

sleep 5

# --------
# 5. Verify the resulting transaction
osd q tx "$TXHASH" \
  --node "$NODE"

# --------
# 6. Verify that the user has spent only the sent funds and not the fees
GRANTEE_AFTER=$(osd q bank balances "$GRANTEE" --node "$NODE" -o json | jq -r '.balances[0].amount')
GRANTER_AFTER=$(osd q bank balances "$GRANTER" --node "$NODE" -o json | jq -r '.balances[0].amount')
RECEIVER_AFTER=$(osd q bank balances "$RECEIVER" --node "$NODE" -o json | jq -r '.balances[0].amount')

GRANTER_DIFF=$(echo "$GRANTER_AFTER - $GRANTER_BEFORE" | bc)
GRANTEE_DIFF=$(echo "$GRANTEE_AFTER - $GRANTEE_BEFORE" | bc)
RECEIVER_DIFF=$(echo "$RECEIVER_AFTER - $RECEIVER_BEFORE" | bc)

echo "Granter:"
echo "  Before: $GRANTER_BEFORE"
echo "  After:  $GRANTER_AFTER"
echo "  Diff:   $GRANTER_DIFF"

echo "Grantee:"
echo "  Before: $GRANTEE_BEFORE"
echo "  After:  $GRANTEE_AFTER"
echo "  Diff:   $GRANTEE_DIFF"

echo "Receiver:"
echo "  Before: $RECEIVER_BEFORE"
echo "  After:  $RECEIVER_AFTER"
echo "  Diff:   $RECEIVER_DIFF"
