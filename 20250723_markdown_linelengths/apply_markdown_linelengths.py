#!/usr/bin/python3
# ----------------------
# Imports
#
import os
import re
import sys

# ----------------------
# Globals
#
LINE_LENGTH = 120
BREAK_BEFORE = r' (and|or|which|that|to)'
BREAK_AFTER = r'(?:\s*\d+\.)*(\.|:|,|\!|\?) '



# ----------------------
# Definitions
#
def find_match_to_break_in_line(line: str) -> list:
    prev_match = ...
    for current_match in re.finditer(BREAK_BEFORE, line):
        if current_match.end() > LINE_LENGTH:
            if current_match.start() > LINE_LENGTH:
                return prev_match
            else:
                return current_match

        prev_match = current_match

    return None


def break_line(line: str, match: re.Match) -> str:
    return line[:match.start()] + r'\n' + line[match.start():]


def apply_markdown_line_length(path: str) -> bool:
    if not os.path.isdir(path) or not os.path.exists(path):
        return False

    for root, _, files in os.walk(path):
        for file in files:
            if not file.endswith(".md"):
                continue

            file_path = os.path.join(root, file)
            with open(file_path, "r") as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                if len(line) > LINE_LENGTH:
                    print("Line pre: ", line)
                    if re.search(BREAK_AFTER, line):
                        line = re.sub(BREAK_AFTER, '\1' + r'\n', line)
                    elif re.search(BREAK_BEFORE, line):
                        line = re.sub(BREAK_BEFORE, r'\n' + '\1', line)
                    else:
                        line = line
                    lines[i] = line
                    print("Line pos: ", lines[i])

            with open(file_path, "w") as f:
                f.writelines(lines)

    return True


# ----------------------
# Execution
#
if __name__ == '__main__':
    apply_markdown_line_length(sys.argv[1])
