# Contributing

## Workflow

1. Open or select a GitHub issue.
2. Confirm the intended outcome and acceptance criteria.
3. Update affected documentation with the implementation.
4. Open a focused pull request linked to the issue.
5. Record verification evidence in the pull request.

## Sources of truth

- `docs/product/PRD.md` describes accepted product behavior.
- `docs/engineering/` describes the accepted technical contract.
- `docs/adr/` explains material decisions and their consequences.
- GitHub issues contain proposals, questions, tasks, and historical discussion.

An issue does not override an accepted document until a pull request updates that document.

## Requirement changes

Every behavior change must identify:

- affected requirement IDs;
- user and business impact;
- API and data impact;
- testing impact;
- compatibility or migration concerns.

## Pull requests

Keep pull requests small enough to review. Link the originating issue, describe what changed and why, list verification performed, and call out documentation or migration changes explicitly.

