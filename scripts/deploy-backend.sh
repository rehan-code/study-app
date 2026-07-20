#!/usr/bin/env bash
#
# Deploy the Mufradat backend to a personal Supabase project.
#
# What it does:
#   1. Links this repo to the Supabase project (SUPABASE_PROJECT_REF).
#   2. Pushes SQL migrations from supabase/migrations.
#   3. Sets edge function secrets for whichever of ANTHROPIC_API_KEY,
#      ANTHROPIC_MODEL, FAL_KEY, FAL_MODEL are present in the environment
#      (missing ones are skipped, existing secrets are left untouched).
#   4. Deploys the parse-scan and generate-card-image edge functions.
#
# When to run: after creating the Supabase project, and again whenever
# migrations, edge functions, or secret values change. Do not run it against
# a project you do not own; it applies migrations immediately.
#
# Idempotency: safe to re-run. Linking overwrites the local link, db push
# skips already-applied migrations, secrets are upserts, and function
# deploys replace the previous version in place.
#
# Required env:
#   SUPABASE_PROJECT_REF   project ref from the dashboard URL
#                          (https://supabase.com/dashboard/project/<ref>)
# Auth:
#   Run `supabase login` once, or export SUPABASE_ACCESS_TOKEN.
# Optional env (each becomes an edge function secret when set):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL, FAL_KEY, FAL_MODEL
#
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found. Install it first:" >&2
  echo "  brew install supabase/tap/supabase" >&2
  exit 1
fi

if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  echo "error: SUPABASE_PROJECT_REF is required." >&2
  echo "  Find it in the dashboard URL: https://supabase.com/dashboard/project/<ref>" >&2
  echo "  Then run: SUPABASE_PROJECT_REF=<ref> ./scripts/deploy-backend.sh" >&2
  exit 1
fi

echo "==> Linking to project ${SUPABASE_PROJECT_REF}"
supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo "==> Pushing database migrations"
supabase db push

secret_args=()
secret_names=""
for name in ANTHROPIC_API_KEY ANTHROPIC_MODEL FAL_KEY FAL_MODEL; do
  value="${!name:-}"
  if [ -n "$value" ]; then
    secret_args+=("${name}=${value}")
    secret_names="${secret_names} ${name}"
  fi
done

if [ "${#secret_args[@]}" -gt 0 ]; then
  echo "==> Setting edge function secrets:${secret_names}"
  supabase secrets set "${secret_args[@]}"
else
  echo "==> No secret env vars present; skipping secrets (set them later with 'supabase secrets set')"
fi

echo "==> Deploying edge functions"
supabase functions deploy parse-scan generate-card-image import-pdf-batch

echo "==> Done. Smoke-test instructions: docs/BACKEND.md"
