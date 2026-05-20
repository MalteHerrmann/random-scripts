#!/usr/bin/env bash
set -euo pipefail

FILE="${1:?Usage: $0 <audit-json-file>}"

jq -r '
def fmt(lbl):
  if .pubkey == null then "  \(lbl): None [none]"
  else "  \(lbl): \(.pubkey) [\(.classification)]"
  end;

def ext_authorities:
  if .transferFeeConfigAuthority? then
    ("    transferFeeConfigAuthority: " + (if .transferFeeConfigAuthority.pubkey == null then "None [none]" else "\(.transferFeeConfigAuthority.pubkey) [\(.transferFeeConfigAuthority.classification)]" end)),
    ("    withdrawWithheldAuthority:  " + (if .withdrawWithheldAuthority.pubkey == null then "None [none]" else "\(.withdrawWithheldAuthority.pubkey) [\(.withdrawWithheldAuthority.classification)]" end))
  elif .rateAuthority? then
    "    rateAuthority: " + (if .rateAuthority.pubkey == null then "None [none]" else "\(.rateAuthority.pubkey) [\(.rateAuthority.classification)]" end)
  elif .updateAuthority? then
    "    updateAuthority: " + (if .updateAuthority.pubkey == null then "None [none]" else "\(.updateAuthority.pubkey) [\(.updateAuthority.classification)]" end)
  elif .delegate? then
    "    delegate: " + (if .delegate.pubkey == null then "None [none]" else "\(.delegate.pubkey) [\(.delegate.classification)]" end)
  elif .authority? then
    "    authority: " + (if .authority.pubkey == null then "None [none]" else "\(.authority.pubkey) [\(.authority.classification)]" end)
  else
    "    (no authority)"
  end;

"=== PROGRAM ===",
"  address:           \(.program.address)",
"  programData:       \(.program.programDataAddress // "—")",
(.program.upgradeAuthority | fmt("upgradeAuthority")),
"",
"=== MINT ===",
"  address:           \(.mint.address)",
(.mint.mintAuthority   | fmt("mintAuthority  ")),
(.mint.freezeAuthority | fmt("freezeAuthority")),
"",
"=== EXTENSIONS ===",
if (.mint.extensions | length) == 0 then "  (none)" else
  (.mint.extensions[] | "  \(.type)", ext_authorities)
end
' "$FILE"
