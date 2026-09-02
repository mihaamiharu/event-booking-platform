# ADR-0003: Use versioned documents as truth and issues as workflow

**Status:** Accepted  
**Date:** 2026-09-02

## Context

The project should expose a realistic development and testing lifecycle. Decisions need both a durable current specification and visible historical discussion.

## Decision

Versioned repository documents are the source of accepted product and technical truth. GitHub issues capture proposals, questions, bugs, and work. Pull requests update documents and implementation together. Material decisions receive ADRs.

## Consequences

- An issue does not silently change product behavior.
- Requirement changes identify affected stable requirement IDs.
- Pull requests provide a reviewable link between discussion, decision, specification, code, and verification.
- ADRs retain the reasoning behind choices that would otherwise disappear from closed issues.

