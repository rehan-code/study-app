# Backend setup

How to stand up the Mufradat backend on a personal Supabase project: database,
storage, auth, and the three Deno edge functions (`parse-scan`,
`generate-card-image`, `import-pdf-batch`). The whole flow takes about ten
minutes.

This is a personal project. Do NOT use a work organization; create the project
under your own Supabase account.

## 1. Create the Supabase project

1. Sign in at https://supabase.com/dashboard (create a free account if needed).
2. New project: pick your personal org, name it (e.g. `arabic-study`), choose a
   strong database password (saved in your password manager; the app never
   needs it), and a region near you.
3. Wait for provisioning to finish, then note the project ref: it is the
   subdomain in the dashboard URL, `https://supabase.com/dashboard/project/<ref>`.

## 2. App environment (.env)

Copy the example file and fill in the two values from
Project Settings -> API:

```sh
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

Only these two values ever ship to the client. The AI keys (Anthropic, fal.ai)
live exclusively as edge function secrets (step 5); never put them in `.env`.

## 3. Auth: email confirmation

The app signs in with email + password. By default Supabase requires a
confirmation email before the first sign in. Pick one:

- Disable it (simplest for a personal app): Dashboard -> Authentication ->
  Sign In / Up -> Email -> turn off "Confirm email".
- Or keep it on and click the confirmation link once after signing up in the
  app. The sign-up screen tells you when a confirmation email was sent.

## 4. Install the CLI and deploy

Install the Supabase CLI and authenticate once:

```sh
brew install supabase/tap/supabase
supabase login   # opens the browser; or export SUPABASE_ACCESS_TOKEN=<token>
```

(An access token can also be created at
https://supabase.com/dashboard/account/tokens and exported as
`SUPABASE_ACCESS_TOKEN` for non-interactive use.)

Then deploy everything (migrations + secrets + functions) in one step. Secrets
are optional here; any that are unset are simply skipped and can be set later:

```sh
SUPABASE_PROJECT_REF=<ref> \
ANTHROPIC_API_KEY=sk-ant-... \
FAL_KEY=... \
./scripts/deploy-backend.sh
```

The script is idempotent: re-run it whenever migrations, functions, or secret
values change. See the header of `scripts/deploy-backend.sh` for details.

## 5. Edge function secrets

The functions read these at runtime (Dashboard -> Edge Functions -> Secrets,
or `supabase secrets set`):

| Secret              | Required | Purpose                                       |
| ------------------- | -------- | --------------------------------------------- |
| `ANTHROPIC_API_KEY` | yes      | Claude vision parsing in `parse-scan`         |
| `ANTHROPIC_MODEL`   | no       | override model, default `claude-sonnet-5`     |
| `FAL_KEY`           | yes      | image generation in `generate-card-image`     |
| `FAL_MODEL`         | no       | override model, default `fal-ai/flux/schnell` |

To set them manually instead of via the deploy script:

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... FAL_KEY=...
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into edge functions
automatically; do not set them yourself.

## 6. Smoke tests (curl)

Both functions require a signed-in user's JWT (`verify_jwt = true`), and all
data access inside them runs under that user's RLS policies.

Set up shell variables first:

```sh
SUPABASE_URL=https://<ref>.supabase.co
ANON_KEY=<anon key from .env>
```

Get a user JWT by signing in with the account you created in the app:

```sh
USER_JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
```

### parse-scan

A random UUID proves auth and deployment are healthy (expect 404):

```sh
curl -s -X POST "$SUPABASE_URL/functions/v1/parse-scan" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scanId":"00000000-0000-0000-0000-000000000000"}'
# -> {"error":"Scan not found."}
```

For a real parse, create a scan in the app (Scan tab -> New scan), copy its id
from the `scans` table (Dashboard -> Table Editor), and send that id instead.
Success responds `{"parsed":{...}}` and sets the scan's status to `parsed`.

### generate-card-image

```sh
curl -s -X POST "$SUPABASE_URL/functions/v1/generate-card-image" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cardId":"00000000-0000-0000-0000-000000000000"}'
# -> {"error":"Card not found."}
```

With a real card id (from the `cards` table), success responds
`{"path":"<userId>/<cardId>.jpg"}` and fills the card's `ai_image_path`.

### import-pdf-batch

```sh
curl -s -X POST "$SUPABASE_URL/functions/v1/import-pdf-batch" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"importId":"00000000-0000-0000-0000-000000000000"}'
# -> {"error":"Import not found."}
```

Real imports are driven from the app (Scan tab -> Import book): the app uploads
the PDF, inserts a `pdf_imports` row, then calls this function repeatedly. Each
call reads the next page batch (positioned text via pdf.js, no rendering), has
Claude return structured rows, writes lessons and cards, and advances
`next_page`. Interrupting is safe; the next call resumes at the cursor.

## 7. Troubleshooting

| Symptom                                             | Likely cause and fix                                                                                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401 Invalid JWT` / `Missing authorization header`  | You sent the anon key alone, or an expired token. Functions need `Authorization: Bearer <user JWT>` from a real sign-in; re-run the token curl in step 6.                                                                                 |
| Sign in fails with "Email not confirmed"            | Step 3: disable "Confirm email" or click the link in the confirmation email once.                                                                                                                                                         |
| `{"error":"AI parsing isn't set up yet..."}`        | `ANTHROPIC_API_KEY` secret missing. Set it (step 5) and retry; functions read secrets live, no redeploy needed.                                                                                                                           |
| `{"error":"The AI key was rejected..."}`            | The Anthropic key is wrong or revoked. Set a fresh key with `supabase secrets set ANTHROPIC_API_KEY=...`.                                                                                                                                 |
| Scan stuck on `failed`                              | Open the scan row and read `parse_error`; the scans tab in the app offers retry. Check function logs: Dashboard -> Edge Functions -> parse-scan -> Logs.                                                                                  |
| `{"error":"Image generation isn't set up yet..."}`  | `FAL_KEY` secret missing. Set it and retry.                                                                                                                                                                                               |
| Storage 403 / `new row violates row-level security` | The request reached storage without an authenticated user, or the path is outside the caller's own `<userId>/` folder. Make sure the JWT is a signed-in user token (not the anon key) and the migrations in `supabase/migrations/` have been pushed (they create the buckets and the per-user storage policies). |
| `Scan not found.` / `Card not found.` for a real id | RLS scopes lookups to the signed-in user: the id belongs to a different account, or the row was deleted. Verify you are signed in as the row's owner.                                                                                     |
| `supabase db push` fails with auth errors           | Run `supabase login` again or export a valid `SUPABASE_ACCESS_TOKEN`; then re-run the deploy script.                                                                                                                                      |
| Function responds 503 "busy right now"              | Upstream (Anthropic or fal.ai) rate limit. Wait a minute and retry.                                                                                                                                                                       |

## Architecture notes

- Contracts: docs/ARCHITECTURE.md "Edge function contracts" is the source of
  truth. The zod mirror of the parser contract lives at
  `supabase/functions/_shared/parsed-scan-contract.ts` and must stay in sync
  with `src/domain/parsed-scan.ts`.
- Both functions build their Supabase client from the caller's Authorization
  header (`_shared/supabase.ts`), so every query and storage call runs under
  the caller's RLS policies. User identity comes from `auth.getUser()`; ids in
  the request body are never trusted for ownership.
- `parse-scan` sends all page photos in one Anthropic Messages request with a
  forced tool call whose JSON schema matches the parsed-scan contract, then
  validates the tool output with the zod mirror before persisting.
- `generate-card-image` calls fal.ai, downloads the generated image, uploads
  it to the private `card-images` bucket at `<userId>/<cardId>.jpg` (upsert),
  and records the path on the card.
