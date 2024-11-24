import subprocess
import os
import re


def apply_diff(source_repo, target_dir, diff_number):
    diff_number = int(diff_number) # convert str to int

    diffs_dir = os.path.join(source_repo, "diffs")
    for entry in os.listdir(diffs_dir):
        if entry.startswith(f"{diff_number:03d}_evmos_diff_") and entry.endswith(".diff"):
            diff_file = entry
            break
    else:
        raise FileNotFoundError(f"Diff file not found for number: {diff_number}")

    diff_file_path = os.path.join(diffs_dir, diff_file)

    os.chdir(target_dir)
    result = subprocess.run(['git', 'apply', '--reject', diff_file_path], capture_output=True, text=True)

    # NOTE: the outputs are usually being printed to the stderr, so we're scanning that only
    failed_patches = []
    cleanly_applied_patches = []

    for line in result.stderr.splitlines():
        error_match = re.search(r"error: (?P<reason>.+)", line)
        if error_match and "while searching for" not in error_match.group('reason'):
            failed_patches.append(error_match.group('reason'))

        clean_match = re.search(r"Applied patch (?P<file>\S+) cleanly", line)
        if clean_match:
            cleanly_applied_patches.append(clean_match.group('file'))
        
    if cleanly_applied_patches:
        print("\nCleanly applied patches:")
        for patch in cleanly_applied_patches:
            print("   ", patch)

    if failed_patches:
        print("\nSome patches could not be applied:")
        for reason in failed_patches:
            print("   ", reason)

    print(f"\nDone applying {diff_file}") 
