# ADR-0001: Maintain a standalone system under test

**Status:** Accepted  
**Date:** 2026-09-02

## Context

The product will be used in courses, videos, and testing exercises. It must also behave like a normal product that can be explored independently.

## Decision

The Event Booking Platform is a separate product, repository, deployment, database, and release lifecycle. It has no runtime dependency on TestingWithEkki. Learning platforms may link to it or test it through its public interfaces.

## Consequences

- Product documents describe this application rather than the learning platform.
- Users can explore it without a TestingWithEkki account.
- Authentication and learner-workspace isolation are owned by this product.
- Course solutions and answer keys must live elsewhere.
- Deployment and incidents can be managed independently.

