---
name: example-rule-2 # Unique identifier for the rule
title: Example Rule 2 # Human-readable title
tags: [example, rule] # Categorization tags
slug: /rules/subdirectory/example-rule-2.rule/
related: # Cross-references to related documents (one or many)
  rfcs: [example-rfc-1] # Related RFCs by name
  adrs: [example-adr-1] # Related ADRs by name
  rules: [example-rule-1] # Related rules by name
  guides: [example-guide-2] # Related guides by name
  projects: [example-project-1] # Related projects by name
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
