"""
This script calculates the minted staking provision on Evmos
for different bonding targets.

This is done for the governance proposal to reduce the bonding
target from 66% to 33%, which can be found at:
https://www.notion.so/evmos/Decrease-bonding-target-0e05fea889a84ca8b408b173039fa8c6
"""

# Bonding parameters
BONDED_RATIO = 127.05 / 371.84  # see on mintscan.io/evmos dashboard
MAX_VARIANCE = 0.4

# Decay constants
A = 300_000_000
C = 9_375_000
R = 0.5

# Distribution constants
STAKING_RATIO = 0.533333333


# -----------------
# Functions
#
def exp_decay(period: int) -> float:
    return A * (1 - R) ** period + C


def bonding_incentive(bonding_target: float) -> float:
    return 1 + MAX_VARIANCE - BONDED_RATIO * (MAX_VARIANCE / bonding_target)


def calculate_provision_for_bonding_target(bonding_target: int):
    print(f"\n----------------\nBonding Target: {bonding_target}")
    for idx in range(4):
        provision = exp_decay(idx) * bonding_incentive(bonding_target)
        staking_provision = round(STAKING_RATIO * provision)
        print(f" {idx} - {staking_provision}")


# -----------------
# Execution
#
if __name__ == "__main__":
    calculate_provision_for_bonding_target(0.66)
    calculate_provision_for_bonding_target(0.33)
    
