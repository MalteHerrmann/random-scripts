#!/usr/bin/env python3

import os
import sys
from pathlib import Path
from typing import Dict, List
from dataclasses import dataclass


@dataclass
class RepoStatus:
    name: str
    has_readme: bool
    has_changelog: bool
    has_github_actions: bool
    github_actions: List[str]

    @property
    def status_summary(self) -> Dict[str, bool]:
        return {
            "README": self.has_readme,
            "Changelog": self.has_changelog,
            "GitHub Actions": self.has_github_actions
        }


def check_repository(repo_path: Path) -> RepoStatus:
    """Check a repository for required files and structures."""
    name = repo_path.name

    # Check for README (case insensitive)
    has_readme = any(f.lower() == "readme.md" for f in os.listdir(repo_path))

    # Check for Changelog (various common names)
    changelog_names = {"changelog.md", "changes.md", "history.md"}
    has_changelog = any(
        f.lower() in changelog_names for f in os.listdir(repo_path)
    )

    # Check for GitHub Actions
    github_actions_path = repo_path / ".github" / "workflows"
    github_actions = []
    if github_actions_path.exists():
        for workflow in github_actions_path.glob("*.yml"):
            github_actions.append(workflow.stem)
    has_github_actions = len(github_actions) > 0

    return RepoStatus(name, has_readme, has_changelog, has_github_actions, github_actions)


def print_markdown_table(headers: List[str], rows: List[List[str]], title: str = None) -> None:
    """Print a markdown-formatted table."""
    if title:
        print(f"\n### {title}\n")

    # Calculate column widths
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))

    # Print headers
    header_cells = [h.ljust(w) for h, w in zip(headers, col_widths)]
    print(f"| {' | '.join(header_cells)} |")

    # Print separator
    separator_cells = ['-' * w for w in col_widths]
    print(f"| {' | '.join(separator_cells)} |")

    # Print rows
    for row in rows:
        row_cells = [str(cell).ljust(w) for cell, w in zip(row, col_widths)]
        print(f"| {' | '.join(row_cells)} |")


def print_results(repos: List[RepoStatus]):
    """Print results in markdown table format."""
    # First table: General repository structure
    headers = ["Repository", "README", "Changelog", "GitHub Actions"]
    rows = [
        [
            repo.name,
            "✅" if repo.has_readme else "❌",
            "✅" if repo.has_changelog else "❌",
            "✅" if repo.has_github_actions else "❌"
        ]
        for repo in repos
    ]

    print_markdown_table(headers, rows, "Repository Structure Check Results")

    # Second table: GitHub Actions matrix
    if any(repo.has_github_actions for repo in repos):
        # Collect all unique workflow names
        all_workflows = sorted(set(
            workflow
            for repo in repos
            for workflow in repo.github_actions
        ))

        if all_workflows:
            headers = ["Workflow"] + [repo.name for repo in repos]
            rows = [
                [workflow] + [
                    "✅" if workflow in repo.github_actions else "❌"
                    for repo in repos
                ]
                for workflow in all_workflows
            ]

            print_markdown_table(headers, rows, "GitHub Actions Matrix")
    else:
        print("\nNo GitHub Actions found in any repository.")


def main():
    if len(sys.argv) != 2:
        print("Usage: python check_repo_structure.py <directory_path>")
        sys.exit(1)

    base_path = Path(sys.argv[1]).resolve()
    if not base_path.exists() or not base_path.is_dir():
        print(f"Error: {base_path} is not a valid directory")
        sys.exit(1)

    # Get all subdirectories that are git repositories (excluding evmos)
    repos = []
    for item in base_path.iterdir():
        if item.is_dir() and (item / ".git").exists() and item.name.lower() != "evmos":
            repos.append(check_repository(item))

    if not repos:
        print("No Git repositories found in the specified directory.")
        sys.exit(0)

    print_results(repos)


if __name__ == "__main__":
    main()
