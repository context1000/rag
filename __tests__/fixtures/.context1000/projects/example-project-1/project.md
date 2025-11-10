---
name: example-project-1 # Unique identifier for the project
title: Example Project 1 # Human-readable title
tags: [example, project] # Categorization tags
repository: <link> # Project repository URL
slug: /projects/example-project-1.project/
related: # Cross-references to related documents (one or many)
  rfcs: [example-rfc-2] # Related RFCs by name
  adrs: [example-adr-2] # Related ADRs by name
  rules: [example-rule-3] # Related rules by name
  guides: [example-guide-3] # Related guides by name
  projects: [] # Related projects by name
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

information about project here
