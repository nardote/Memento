---
name: memento-checkpoint
description: Offer reviewable Memento checkpoints while developing, investigating, validating, releasing, or handling incidents. Use when work produces durable findings, decisions, evidence, blockers, or handoff context; do not activate for trivial questions or routine commands.
---

# Memento Checkpoint

Memento is a shared, append-only activity log exposed through MCP. Use it to
preserve concise continuity and evidence, not as a replacement for source code,
Jira, GitLab, architecture documents, deployment state, or telemetry.

## Checkpoint Policy

Offer a checkpoint only after a meaningful milestone:

- a cause, decision, contract, affected repository, or dependency is confirmed;
- a relevant hypothesis is ruled out;
- a validation, deployment verification, or incident phase finishes;
- a blocker, risk, next action, or handoff becomes clear;
- the requested task finishes with durable context worth resuming later.

Do not interrupt after every command. Do not repeat a proposal the user already
discarded during the current task.

Before calling `activity_add`, show a compact proposal containing the project,
action, evidence-backed details, useful tags, and next action when applicable.
Ask whether to **Guardar**, **Editar**, or **Descartar**. Only call the tool after
the user explicitly chooses Guardar. Authorization to investigate, edit code,
or run tests does not authorize a Memento write.

If the user chooses Editar, revise the proposal and request confirmation again.
If the user chooses Descartar, continue without writing.

## Content Rules

- Describe verified facts as facts and label hypotheses or pending checks.
- Link or name the authoritative evidence instead of copying large outputs.
- Never store credentials, tokens, PNRs, passenger data, personal data, or raw
  logs. Redact sensitive identifiers from summaries.
- Keep activities useful for another person resuming the work.
- Let the MCP derive `actor` from the authenticated token; never claim an actor
  in tool arguments.
- Prefer stable Memento projects and tags for variable dimensions such as
  ticket, repository, environment, status, and kind.

## Tool Use

Use `activity_add` for approved writes, `activity_list` for recent project
context, and `activity_search` for a known ticket, repository, incident, or
topic. Read [references/memento-contract.md](references/memento-contract.md)
before the first Memento tool call in a task.

Do not assume Memento tools exist merely because this skill is installed. If
they are unavailable, explain that the skill is present but the Memento MCP is
not connected; provide the prepared checkpoint in text and do not pretend it
was saved.
