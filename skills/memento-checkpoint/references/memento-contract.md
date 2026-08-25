# Memento MCP contract

Read this reference before the first Memento tool call in a task.

## Activities

`activity_add` creates an immutable activity. Required arguments:

```json
{
  "project": "sky-development",
  "action": "Short milestone title",
  "details": "Evidence, result, limitations, and next action",
  "tags": ["ticket:SKY-1234", "repo:service-name", "env:qa"]
}
```

The authenticated token determines the actor. Do not send credentials or an
actor in `details` or `tags`.

`activity_list` reads recent activity:

```json
{
  "project": "sky-development",
  "limit": 20,
  "actor": "optional-username"
}
```

`activity_search` searches within one authorized project:

```json
{
  "project": "sky-development",
  "query": "SKY-1234",
  "limit": 20,
  "actor": "optional-username"
}
```

## Suggested project and tag vocabulary for Sky

Prefer stable projects:

- `sky-development`
- `sky-qa`
- `sky-incidents`
- `sky-releases`
- `sky-architecture`

Useful tags:

- `ticket:<key>`
- `repo:<repository>`
- `env:<local|qa|tsts|stage|production>`
- `kind:<investigation|decision|validation|contract-trace|incident|release>`
- `status:<in-progress|blocked|validated|completed>`
- `result:<passed|failed|inconclusive>`

Do not invent a project the authenticated user may not access. If the intended
project is unclear and materially changes who can read the activity, ask the
user before proposing the write.
