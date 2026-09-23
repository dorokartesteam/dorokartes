# Security

## Scope

This file documents security practices for Dorokartes.gr. It intentionally contains no secret values.

## Secrets

Never commit:

- database passwords
- database connection strings containing credentials
- admin passwords
- API keys
- access tokens
- private signing secrets
- service-account credentials

Use the hosting provider's encrypted environment-variable system for production secrets.

## Admin access

The current codebase uses:

- `ADMIN_USER`
- `ADMIN_PASSWORD`

through `proxy.ts` for admin protection.

At handover:

- create buyer-controlled credentials
- do not reuse seller passwords
- rotate credentials after transfer
- remove seller access after acceptance

## Database

`DATABASE_URL` grants database access and should be treated as a high-value secret.

Recommended controls:

- unique production credential
- separate non-production credentials
- least privilege where practical
- provider MFA
- backups
- credential rotation after ownership transfer

## Third-party APIs

Potentially sensitive keys include:

- `OPENAI_API_KEY`
- `SERPER_API_KEY`

Only transfer keys if the associated account/service is part of the sale. Otherwise, the buyer should create their own key.

## Public variables

Variables prefixed with `NEXT_PUBLIC_` are exposed to browser-side code by design.

Current public variables include:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`

Never place secrets in a `NEXT_PUBLIC_*` variable.

## Data-changing scripts

The repository contains many powerful catalog scripts.

Security and integrity controls:

- inspect before running
- prefer dry-run/preview
- require explicit `--apply` where implemented
- use plan IDs when implemented
- back up before bulk mutations
- preserve post-audit evidence
- do not rerun historical migration scripts blindly

## Dependency security

Before release:

```bash
npm audit
npm run lint
npm run build
```

Review high/critical findings before production changes.

Do not automatically run breaking dependency upgrades solely to make an audit count reach zero.

## Production errors

Do not expose:

- stack traces
- credentials
- database URLs
- secret environment-variable values
- internal admin-only identifiers unnecessarily

## Media and external URLs

Merchant URLs and media are external trust boundaries.

Controls should include:

- accepted `http`/`https` schemes only where relevant
- validated outbound URLs
- controlled redirect route
- no direct promotion of unsafe/unverified catalog records
- provenance for verified records

## Account security

For all transferable infrastructure:

- MFA enabled
- buyer-controlled recovery email
- buyer-controlled phone/recovery methods
- no shared personal password
- no stale contractor accounts
- least privilege for collaborators

## Handover rotation checklist

Rotate at closing:

- database credentials
- admin credentials
- OpenAI key if transferred
- Serper key if transferred
- hosting tokens
- Git deploy tokens
- email/API credentials
- analytics/service credentials where applicable

## Security review after acquisition

Buyer should review:

- `proxy.ts`
- admin API routes
- environment-variable usage
- database permissions
- package dependencies
- external integrations
- CSP/security headers
- rate limiting, if required by traffic profile
- logging and monitoring
- data-retention requirements

## Incident handling

If a secret is exposed:

1. rotate it immediately
2. revoke the old credential
3. determine where it was exposed
4. remove it from active files
5. if committed to Git, treat history as compromised even after deleting the line
6. rotate any credentials derived from or related to it
7. document the incident
