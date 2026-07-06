# CLAUDE.md

This repository is a loose collection of (mostly) unrelated utilities and one-off scripts.

The tools generally have nothing to do with one another — do not assume shared

code, conventions, or dependencies across folders. Each tool is self-contained.

## Creating a new tool

1. Create a top-level folder named `YYYYMMDD_<brief_snake_case_name>`, where the

   prefix is today's date and the name is a short, descriptive slug.

   Example: `20260630_parse_csv_export`.
2. Keep everything for the tool inside that folder, including its dependency and

   lockfiles. Don't add shared/root-level config.
3. Add a short `README.md` to the folder explaining what the tool does and how to

   run it.

## Dev environment

The toolchains are tracked with [mise](https://mise.jdx.dev) in the root

`.mise.toml`. Run `mise install` to put them on PATH. A single-language tool may

add its own `.mise.toml` to pin tighter versions.

## Per-language tooling

Pick whatever language fits the task; there is no default. Manage the project with

the standard toolchain for that language:

- **Python** → `uv` (`uv init`, `uv add`, `uv run`). No bare `pip`/`venv`.
- **JavaScript / TypeScript** → `pnpm`. Use `ts-node` as the TypeScript runner (not `tsx` — `tsx` depends on esbuild's native binary, which requires explicit pnpm build allowlisting on every fresh setup). Set `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in `tsconfig.json` so ts-node handles ESM automatically.
- **Go** → the `go` toolchain (`go mod`, `go run`, `go build`).
- **Rust** → `cargo`.

## Dependencies

- Prefer well-established libraries over hand-rolling functionality that a common,

  widely-used package already provides.
- If the only options are questionable packages with little real-world usage, don't

  silently depend on one — raise it with me first so we can decide whether to

  reimplement the needed bit instead.

