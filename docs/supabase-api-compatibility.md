# Supabase Management API compatibility

Harbor v0.1.0 uses:

| Operation              | Endpoint                                      |
| ---------------------- | --------------------------------------------- |
| Account validation     | `GET /v1/profile`                             |
| Organizations          | `GET /v1/organizations`                       |
| Projects               | `GET /v1/projects`                            |
| Project reconciliation | `GET /v1/projects/{ref}`                      |
| Service health         | `GET /v1/projects/{ref}/health`               |
| Restore                | `POST /v1/projects/{ref}/restore`             |
| Project API keys       | `GET /v1/projects/{ref}/api-keys?reveal=true` |

Health requests use
`services=auth,db,pooler,realtime,rest,storage&timeout_ms=5000`.

All successful 2xx responses are accepted. Reads retry network errors, 429, and
retryable 5xx failures at most twice. Restore POST is never automatically retried.
Unknown future project statuses are retained as raw values and map to Harbor's
`unknown` lifecycle.

Before a release, review the official Management API reference and Supabase breaking
changes. The v1 scope does not use the logs endpoint.

Automatic keepalive enrollment requires `api_gateway_keys_read`. Harbor prefers a
modern publishable key and accepts a legacy JWT only when its decoded role is
`anon`. Secret and service-role keys are rejected.

The worker calls exactly:

```text
POST https://<20-character-project-ref>.supabase.co/rest/v1/rpc/harbor_ping
apikey: <publishable-or-legacy-anon-key>
Content-Type: application/json

{}
```

Redirects are disabled, arbitrary URLs are not accepted, and only a valid recent
timestamp response is successful. The heartbeat is an operational risk-reduction
measure, not a guarantee against project pausing.
