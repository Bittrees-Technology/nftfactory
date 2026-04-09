#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOLS_DIR="${INDEXER_DIR}/.tools/postgres15"
DEB_DIR="$TOOLS_DIR/debs"
ROOT_DIR="$TOOLS_DIR/root"

mkdir -p "$DEB_DIR" "$ROOT_DIR"

base_url="https://deb.debian.org/debian"
packages=(
  "pool/main/p/postgresql-15/postgresql-15_15.15-0+deb12u1_arm64.deb"
  "pool/main/p/postgresql-15/postgresql-client-15_15.15-0+deb12u1_arm64.deb"
  "pool/main/p/postgresql-common/postgresql-common_248+deb12u1_all.deb"
  "pool/main/p/postgresql-common/postgresql-client-common_248+deb12u1_all.deb"
  "pool/main/p/postgresql-15/libpq5_15.15-0+deb12u1_arm64.deb"
  "pool/main/l/llvm-toolchain-14/libllvm14_14.0.6-12_arm64.deb"
  "pool/main/i/icu/libicu72_72.1-3+deb12u1_arm64.deb"
  "pool/main/o/openldap/libldap-2.5-0_2.5.13+dfsg-5_arm64.deb"
  "pool/main/k/krb5/libgssapi-krb5-2_1.20.1-2+deb12u4_arm64.deb"
  "pool/main/o/openssl/libssl3_3.0.18-1~deb12u1_arm64.deb"
  "pool/main/libx/libxml2/libxml2_2.9.14+dfsg-1.3~deb12u5_arm64.deb"
  "pool/main/libx/libxslt/libxslt1.1_1.1.35-1+deb12u3_arm64.deb"
  "pool/main/l/lz4/liblz4-1_1.9.4-1_arm64.deb"
  "pool/main/libz/libzstd/libzstd1_1.5.4+dfsg2-5_arm64.deb"
  "pool/main/z/zlib/zlib1g_1.2.13.dfsg-1_arm64.deb"
)

for package_path in "${packages[@]}"; do
  file_name="$(basename "$package_path")"
  if [ ! -f "$DEB_DIR/$file_name" ]; then
    curl -fsSLo "$DEB_DIR/$file_name" "$base_url/$package_path"
  fi
done

for deb in "$DEB_DIR"/*.deb; do
  dpkg-deb -x "$deb" "$ROOT_DIR"
done

echo "Installed rootless PostgreSQL into $ROOT_DIR"
echo "Set INDEXER_POSTGRES_ROOT=$ROOT_DIR to use this bundle explicitly."
