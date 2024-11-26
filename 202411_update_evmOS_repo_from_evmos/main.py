"""
This tool is used to update the evmOS repository
based on the recent commits to the main branch of the Evmos repository.

Usage:
    python main.py
"""

import argparse
from diff_utils import update_repository
from apply_diff import apply_diff

def create_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Update evmOS repository from Evmos repository.")
    subparsers = parser.add_subparsers(dest='command')

    # Subcommand for generating diffs
    generate_parser = subparsers.add_parser('generate', help='Generate diff files')
    generate_parser.add_argument('source_repo', help='Path to the source repository')
    generate_parser.add_argument('last_sync_commit', help='Last synced commit hash')

    # Subcommand for applying diffs
    apply_parser = subparsers.add_parser('apply', help='Apply diff files')
    apply_parser.add_argument('source_repo', help='Path to the source repository')
    apply_parser.add_argument('target_dir', help='Target directory to apply diffs')
    apply_parser.add_argument('diff_number', help='Diff number to apply')

    return parser

if __name__ == "__main__":
    parser = create_arg_parser()
    args = parser.parse_args()

    if args.command == 'generate':
        update_repository(args.source_repo, args.last_sync_commit)
    elif args.command == 'apply':
        apply_diff(args.source_repo, args.target_dir, args.diff_number)
    else:
        parser.print_help()

