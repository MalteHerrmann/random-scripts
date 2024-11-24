import subprocess
import os

def get_commits_after(source_repo, last_sync_commit):
    os.chdir(source_repo)
    result = subprocess.run(['git', 'log', '--oneline'], capture_output=True, text=True, check=True)
    commits = result.stdout.strip().split('\n')
    
    filtered_commits = []
    for commit in commits:
        commit_hash = commit.split(' ')[0]
        filtered_commits.append(commit)
        if commit_hash == last_sync_commit:
            break

    return filtered_commits 