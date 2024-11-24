import subprocess
import os

def apply_diff(source_repo, target_dir, diff_file):
    diff_file_path = os.path.join(source_repo, "diffs", diff_file)
    if not os.path.exists(diff_file_path):
        raise FileNotFoundError(f"Diff file not found: {diff_file_path}")

    os.chdir(target_dir)
    result = subprocess.run(['git', 'apply', '--reject', diff_file_path], check=True, capture_output=True, text=True)
    print(result.stdout)
    print(result.stderr)
    print(f"Applied diff file: {diff_file}") 
