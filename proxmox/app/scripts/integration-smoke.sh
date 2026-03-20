#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4000}"
TOKEN="${TOKEN:-}"

echo "== Smoke API checks on ${BASE_URL} =="

check_status() {
  local method="$1"
  local url="$2"
  local expected="$3"
  local auth="${4:-no}"
  local body="${5:-}"

  local headers=(-H "Content-Type: application/json")
  if [[ "${auth}" == "yes" && -n "${TOKEN}" ]]; then
    headers+=(-H "Authorization: Bearer ${TOKEN}")
  fi

  local status
  if [[ -n "${body}" ]]; then
    status="$(curl -s -o /tmp/api_smoke_body.$$ -w "%{http_code}" -X "${method}" "${url}" "${headers[@]}" -d "${body}")"
  else
    status="$(curl -s -o /tmp/api_smoke_body.$$ -w "%{http_code}" -X "${method}" "${url}" "${headers[@]}")"
  fi

  if [[ "${status}" != "${expected}" ]]; then
    echo "FAIL ${method} ${url} expected=${expected} got=${status}"
    cat /tmp/api_smoke_body.$$ || true
    exit 1
  fi
  echo "OK   ${method} ${url} -> ${status}"
}

# Public / anonymous expectations
check_status GET "${BASE_URL}/api/commandes/categories" 401 no
check_status GET "${BASE_URL}/api/commandes/tracabilite" 401 no
check_status GET "${BASE_URL}/api/dons/tracabilite" 401 no

if [[ -n "${TOKEN}" ]]; then
  # Authenticated expectations (accept 200 and non-5xx)
  check_status GET "${BASE_URL}/api/shortcuts" 200 yes
  check_status GET "${BASE_URL}/api/commandes/categories" 200 yes
  check_status GET "${BASE_URL}/api/commandes/tracabilite" 200 yes
  check_status GET "${BASE_URL}/api/dons/tracabilite" 200 yes
fi

echo "Smoke checks passed."
