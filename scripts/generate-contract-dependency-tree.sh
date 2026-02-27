#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/packages/contracts/src"
OUT_FILE="$ROOT_DIR/docs/contracts-dependency-tree.md"

if ! command -v rg >/dev/null 2>&1; then
  echo "error: rg is required to generate the dependency tree" >&2
  exit 1
fi

declare -A edges=()
declare -A local_nodes=()
declare -A import_map=()

while IFS= read -r file; do
  rel="${file#$SRC_DIR/}"
  from_node="${rel%.sol}"
  local_nodes["$from_node"]=1

  while IFS= read -r line; do
    imp="$(sed -nE 's/^[[:space:]]*import[[:space:]]+.*"([^"]+)".*/\1/p' <<<"$line")"
    if [[ -z "$imp" ]]; then
      continue
    fi
    if [[ "$imp" == ../* || "$imp" == ./* ]]; then
      target="$(realpath -m "$(dirname "$file")/$imp")"
      if [[ "$target" == "$SRC_DIR/"* ]]; then
        to_node="${target#$SRC_DIR/}"
        to_node="${to_node%.sol}"
        local_nodes["$to_node"]=1
      else
        to_node="$imp"
      fi
    else
      to_node="$imp"
    fi

    edges["$from_node|$to_node"]=1
    if [[ -z "${import_map[$from_node]:-}" ]]; then
      import_map["$from_node"]="$to_node"
    else
      import_map["$from_node"]+=$'\n'"$to_node"
    fi
  done < <(rg -n '^import' "$file" | cut -d: -f2-)
done < <(rg --files "$SRC_DIR" -g '*.sol' | sort)

{
  echo "# Smart Contract Dependency Tree"
  echo
  echo "Generated from Solidity imports in \`packages/contracts/src\`."
  echo
  echo "- Generated at (UTC): $(date -u '+%Y-%m-%d %H:%M:%S')"
  echo "- Regenerate with: \`bash scripts/generate-contract-dependency-tree.sh\`"
  echo
  echo "## Graph"
  echo
  echo "### Internal Contract Graph"
  echo
  echo '```mermaid'
  echo "%%{init: {'theme':'base','flowchart': {'rankSpacing': 170, 'nodeSpacing': 90, 'curve':'linear'}, 'themeVariables': {'fontSize':'18px'}}}%%"
  echo "flowchart TB"
  for edge in "${!edges[@]}"; do
    from="${edge%%|*}"
    to="${edge#*|}"
    if [[ -z "${local_nodes[$to]:-}" ]]; then
      continue
    fi
    from_id="n$(printf '%s' "$from" | cksum | awk '{print $1}')"
    to_id="n$(printf '%s' "$to" | cksum | awk '{print $1}')"
    echo "  $from_id[\"$from\"] --> $to_id[\"$to\"]"
  done | sort
  echo "  classDef default fill:#f9fafb,stroke:#111827,stroke-width:2px,color:#111827,font-size:18px;"
  echo "  linkStyle default stroke:#111827,stroke-width:2.5px;"
  echo '```'
  echo
  echo "### External Library/Proxy Dependencies"
  echo
  echo '```mermaid'
  echo "%%{init: {'theme':'base','flowchart': {'rankSpacing': 140, 'nodeSpacing': 80, 'curve':'linear'}, 'themeVariables': {'fontSize':'16px'}}}%%"
  echo "flowchart TB"
  for edge in "${!edges[@]}"; do
    from="${edge%%|*}"
    to="${edge#*|}"
    if [[ "$to" != @openzeppelin/* ]]; then
      continue
    fi
    from_id="n$(printf '%s' "$from" | cksum | awk '{print $1}')"
    to_id="n$(printf '%s' "$to" | cksum | awk '{print $1}')"
    echo "  $from_id[\"$from\"] --> $to_id[\"$to\"]"
  done | sort
  echo "  classDef default fill:#fff7ed,stroke:#9a3412,stroke-width:2px,color:#7c2d12,font-size:16px;"
  echo "  linkStyle default stroke:#9a3412,stroke-width:2.5px;"
  echo '```'
  echo
  echo "## Contracts and Direct Imports"
  echo
  for node in "${!local_nodes[@]}"; do
    echo "### \`$node.sol\`"
    if [[ -n "${import_map[$node]:-}" ]]; then
      while IFS= read -r dep; do
        echo "- \`$dep\`"
      done < <(printf '%s\n' "${import_map[$node]}" | sort)
    else
      echo "- _(no imports)_"
    fi
    echo
  done
} >"$OUT_FILE"

echo "wrote $OUT_FILE"
