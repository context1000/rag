---
name: example-rfc-1 # Unique identifier for the RFC
title: Example RFC 1 # Human-readable title
status: accepted # accepted, rejected, draft
tags: [example, rfc] # Categorization tags
slug: /decisions/rfc/example-rfc-1.rfc/
related: # Cross-references to related documents (one or many)
  adrs: [example-adr-1] # Related ADRs by name
  guides: [example-guide-1] # Related guides by name
  depends-on: # Dependencies - documents that must exist/be decided first
    adrs: [] # ADRs depends on
    rfcs: [] # RFCs depends on
    guides: [] # Guides depends on
    rules: [] # Rules depends on
    projects: [] # Projects depends on
  supersedes: # Documents that this replaces/deprecates
    adrs: [] # ADRs superseded
    rfcs: [] # RFCs superseded
    guides: [] # Guides superseded
    rules: [] # Rules superseded
    projects: [] # Projects superseded
---

## Summary

Who needs it and what changes in one paragraph.

## Context and problem

Current behavior/limitations, scope of impact.

## Proposed solution

- Architectural idea (1-3 bullet points).
- API/contracts (brief, code block if necessary).
- Data/schema/migrations (one-two sentences).

## Alternatives

Why not X and Y (one sentence per alternative).

## Impact

- Performance/cost
- Compatibility/migrations
- Security/privacy

## Implementation plan

Milestones with estimates: M1, M2, M3. Rollback plan in one sentence.

## Success metrics

How we will understand what worked (numbers/threshold/date).

## Risks and open questions

A short list
