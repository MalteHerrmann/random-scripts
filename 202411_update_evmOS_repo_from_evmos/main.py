"""
This tool is used to update the evmOS repository
based on the recent commits to the main branch of the Evmos repository.

Usage:
    python main.py
"""

import subprocess
import os
import sys
import re

def get_commits_after(source_repo, last_sync_commit):
    """
    Gets the commits in the source repository and
    only returns those after the last synced commit provided.
    """
    # Change to the source repository directory
    os.chdir(source_repo)
    
    # Get the commit logs
    result = subprocess.run(['git', 'log', '--oneline'], capture_output=True, text=True, check=True)
    commits = result.stdout.strip().split('\n')
    
    # Filter commits after the last sync point
    filtered_commits = []
    for commit in commits:
        commit_hash = commit.split(' ')[0]
        filtered_commits.append(commit)

        print(f"comparing {commit_hash} with {last_sync_commit}: {commit_hash == last_sync_commit}")
        # break after adding the last synced commit
        if commit_hash == last_sync_commit:
            break

    return filtered_commits


def create_diff_files(source_repo, commits) -> str:
    """
    Iterates through the list of given commits
    and creates a diff file for each pair of commits.

    Returns the path to the directory containing the diff files.
    """
    # Create a directory for diffs if it doesn't exist
    diffs_dir = os.path.join(source_repo, 'diffs')
    os.makedirs(diffs_dir, exist_ok=True)

    # NOTE: We reverse the commits to get the earliest commits first
    # so that the changes are applied in the correct order
    reversed_commits = commits[::-1]
    for i in range(1, len(reversed_commits)):
        commit_1 = reversed_commits[i - 1].split(' ')[0]
        commit = reversed_commits[i].split(' ')[0]
        diff_file_path = os.path.join(diffs_dir, f"{i:03d}_evmos_diff_{commit_1}_{commit}.diff")
        
        # Create the diff file
        subprocess.run(['git', 'diff', f'{commit_1}..{commit}'], stdout=open(diff_file_path, 'w'), check=True)

    return diffs_dir


def replace_evmos_with_evmOS(diff_file_path):
    """
    Replaces all instances of the Evmos repository with "github.com/evmos/os/"
    in the diff file.
    """
    with open(diff_file_path, 'r') as file:
        content = file.read()

    content = re.sub(r'github\.com/evmos/evmos/v20/', 'github.com/evmos/os/', content)

    with open(diff_file_path, 'w') as file:
        file.write(content)


def update_repository(source_repo, last_sync_commit):
    """
    Updates the evmOS repository by creating diff files
    for each pair of commits on the main branch of the
    Evmos repository after the last synced commit.
    """
    commits = get_commits_after(source_repo, last_sync_commit)
    diffs_dir = create_diff_files(source_repo, commits)

    for diff_file_path in os.listdir(diffs_dir):
        replace_evmos_with_evmOS(os.path.join(diffs_dir, diff_file_path))

    print("Diff files created successfully.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python main.py <source_repo> <last_sync_commit>")
        sys.exit(1)

    source_repo = sys.argv[1]
    last_sync_commit = sys.argv[2]
    
    update_repository(source_repo, last_sync_commit)

