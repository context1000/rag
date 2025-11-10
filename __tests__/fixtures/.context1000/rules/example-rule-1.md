---
name: example-rule-1 # Unique identifier for the rule
title: Example Rule 1 # Human-readable title
tags: [example, rule] # Categorization tags
slug: /rules/example-rule-1.rule/
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

For all new projects and when updating existing ones:

1. use Vitest as the primary testing framework
2. migrate from Jest to Vitest when possible
3. use native TypeScript support without additional transformations
