# --------------------------
# Definitions
#
INITIAL=v10.0.1
TARGET=v10.0.1


# --------------------------
# Execution
#
# Clone Evmos repository
git clone https://github.com/evmos/evmos
cd evmos

# Checkout starting version
git checkout "$INITIAL"
nohup ./local_node.sh &


