---
name: example-rule-4 # Unique identifier for the rule
title: Example Rule 4 # Human-readable title
tags: [example, rule] # Categorization tags
slug: /projects/example-project-1/rules/subdirectory/example-rule-4.rule/
related: # Cross-references to related documents (one or many)
  rfcs: [example-rfc-2] # Related RFCs by name
  adrs: [example-adr-2] # Related ADRs by name
  rules: [example-rule-3] # Related rules by name
  guides: [example-guide-4] # Related guides by name
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
