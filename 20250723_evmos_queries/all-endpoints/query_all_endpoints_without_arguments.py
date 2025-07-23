#!/usr/bin/python3
# -------------------------
# Imports 
#
import subprocess
from typing import List, Tuple


# -------------------------
# Functions
#
def execute_system_call_and_return_error(command: List[str] | str) -> bytes:
    """
    This function executes a call to the underlying operating system and
    returns the captured stderr.
    """

    completed_process = subprocess.run(command, stderr=subprocess.PIPE)
    # TODO: Convert to normal string instead of bytes
    return completed_process.stderr


# -------------------------
# Execution 
#
executed_commands = [
    ["evmosd", "q"],
]
queries_with_errors: List[Tuple[str, bytes]] = []

for executed_queries in executed_commands:
    error = execute_system_call_and_return_error(executed_queries)
    if error != b'':
        queries_with_errors.append((" ".join(executed_queries), error))

print(f"In total {len(queries_with_errors)} out of {len(executed_commands)} queries had errors!")
