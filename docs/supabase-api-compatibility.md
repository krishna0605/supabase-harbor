# Supabase Management API compatibility

Harbor v0.1.0 uses:

| Operation              | Endpoint                          |
| ---------------------- | --------------------------------- |
| Account validation     | `GET /v1/profile`                 |
| Organizations          | `GET /v1/organizations`           |
| Projects               | `GET /v1/projects`                |
| Project reconciliation | `GET /v1/projects/{ref}`          |
| Service health         | `GET /v1/projects/{ref}/health`   |
| Restore                | `POST /v1/projects/{ref}/restore` |

Health requests use
`services=auth,db,pooler,realtime,rest,storage&timeout_ms=5000`.

All successful 2xx responses are accepted. Reads retry network errors, 429, and
retryable 5xx failures at most twice. Restore POST is never automatically retried.
Unknown future project statuses are retained as raw values and map to Harbor's
`unknown` lifecycle.

Before a release, review the official Management API reference and Supabase breaking
changes. The v1 scope does not use the logs endpoint.
