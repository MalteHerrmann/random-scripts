# evmOS Updating Script

This script is used to update the [evmOS](https://github.com/evmos/os) repository
from the recent changes made in the [Evmos](https://github.com/evmos/evmos) repository.

## Usage

```bash
python main.py generate <source_repo> <last_sync_commit>
```

```bash
python main.py apply <source_repo> <target_repo> <diff_number>
```

## Note

Since there are now multiple `go.mod` files in the evmOS repository,
one for the main package and one for the example chain implementation,
applying dependency bumps through the diffs will not work as nicely.

The better option is to manually define the dependency that's being bumped
as the target variable and run the following commands:

```bash
TARGET="github.com/cosmos/cosmos-db@v1.1.0"
go get "$TARGET" && go mod tidy && cd example_chain && go get "$TARGET" && go mod tidy && cd ..
```

This logic is **executed by this tool**, whenever it matches a dependency bump commit.

## Example

First we generate the diffs from the most recent commits in the Evmos repository.
This is also applying known changes between the two repositories,
like renamed variables and import paths.

```bash
python main.py generate "$HOME/dev/evmos/evmos" b72a32d76
```

Then we apply the diffs to the evmOS repository.

```bash
python main.py apply "$HOME/dev/evmos/evmos" "$HOME/dev/evmos/os" 001
```
