import os
import subprocess
import re


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


def create_diff_files(source_repo, commits):
    diffs_dir = os.path.join(source_repo, 'diffs')
    os.makedirs(diffs_dir, exist_ok=True)

    reversed_commits = commits[::-1]
    for i in range(1, len(reversed_commits)):
        commit_1 = reversed_commits[i - 1].split(' ')[0]
        commit = reversed_commits[i].split(' ')[0]
        diff_file_path = os.path.join(diffs_dir, f"{i:03d}_evmos_diff_{commit_1}_{commit}.diff")
        subprocess.run(['git', 'diff', f'{commit_1}..{commit}'], stdout=open(diff_file_path, 'w'), check=True)

    diff_files = [file for file in os.listdir(diffs_dir) if file.endswith('.diff')]

    return diffs_dir, diff_files


def replace_evmos_with_evmOS(diff_file_path):
    with open(diff_file_path, 'r') as file:
        content = file.read()

    # paths
    content = re.sub(r'github\.com/evmos/evmos/v20/', 'github.com/evmos/os/', content)
    content = re.sub(r'ethermint/evm/v1', 'os/evm/v1', content)
    content = re.sub(r'ethermint/feemarket/v1', 'os/feemarket/v1', content)
    content = re.sub(r'ethermint/erc20/v1', 'os/erc20/v1', content)
    content = re.sub(r'ethermint/crypto/v1', 'os/crypto/v1', content)
    content = re.sub(r'ethermint/types/v1', 'os/types/v1', content)
    content = re.sub(r'testutil/integration/evmos/', 'testutil/integration/os/', content)
    content = re.sub(r'app/app.go', 'example_chain/app.go', content)
    content = re.sub(r'app/config.go', 'example_chain/config.go', content)
    content = re.sub(r'app/config_testing.go', 'example_chain/config_testing.go', content)
    content = re.sub(r'app/ante/cosmos/interfaces.go', 'ante/interfaces/cosmos.go', content)
    content = re.sub(r'app/ante/cosmos/', 'ante/cosmos/', content)
    content = re.sub(r'app/ante/evm/interfaces.go', 'ante/interfaces/evm.go', content)
    content = re.sub(r'app/ante/evm/mono.go', 'app/ante/evm/mono_decorator.go', content)
    content = re.sub(r'app/ante/evm/', 'ante/evm/', content)
    content = re.sub(r'app/ante/evm_benchmark_test.go', 'example_chain/ante/evm_benchmark_test.go', content)
    content = re.sub(r'app/ante/handler_options', 'example_chain/ante/handler_options', content)
    content = re.sub(r'app/ante/integration_test.go', 'example_chain/ante/integration_test.go', content)
    content = re.sub(r'app/ante/testutils/testutils.go', 'ante/testutils/testutil.go', content)
    content = re.sub(r'pp.EvmKeeper', 'pp.EVMKeeper', content)
    content = re.sub(r'ante/evm/09_gas_consume', 'ante/evm/08_gas_consume', content)
    content = re.sub(r'ante/evm/10_increment_sequence', 'ante/evm/09_increment_sequence', content)
    content = re.sub(r'ante/evm/11_gas_wanted', 'ante/evm/10_gas_wanted', content)
    content = re.sub(r'ante/evm/12_emit_event', 'ante/evm/11_emit_event', content)
    content = re.sub(r'ante/cosmos/min_price', 'ante/cosmos/min_gas_price', content)
    content = re.sub(r'cmd/evmosd', 'example_chain/osd/cmd', content)
    content = re.sub(r'testutil/contract.go', 'example_chain/testutil/contract.go', content)
    content = re.sub(r'ante/evm/setup_ctx_test.go', 'ante/evm/01_setup_ctx_test.go', content)

    # Code snippets
    content = re.sub(r'[a-z0-9]+\.WEVMOSContractMainnet', 'testconstants.WEVMOSContractMainnet', content)
    content = re.sub(r'[a-z0-9]+\.WEVMOSContractTestnet', 'testconstants.WEVMOSContractTestnet', content)

    with open(diff_file_path, 'w') as file:
        file.write(content)


def update_repository(source_repo, last_sync_commit):
    commits = get_commits_after(source_repo, last_sync_commit)
    diffs_dir, diff_files = create_diff_files(source_repo, commits)

    for diff_file_path in diff_files:
        replace_evmos_with_evmOS(os.path.join(diffs_dir, diff_file_path))

    print(f"{len(diff_files)} diff files created successfully.") 
