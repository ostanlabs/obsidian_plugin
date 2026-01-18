---
id: DOC-004
type: document
title: Library Management
workstream: engineering
status: Draft
created_at: "2025-12-22T07:08:50.261Z"
updated_at: "2026-01-07T13:04:18.029Z"
doc_type: spec
implemented_by: ["M-010"]
updated: 2026-01-17T18:14:41.414Z
---


AEL uses a tiered package model with pre-built sandbox images. Packages are NOT installed dynamically—users declare requirements, AEL routes to appropriate sandbox.

## Tiered Package Model

TIER 1 - Standard (Always Available): Python stdlib only - json, re, datetime, math, random, typing, collections, itertools, functools, hashlib, uuid

TIER 2 - Common (OSS, opt-in): Popular packages, security-reviewed, pre-installed - requests, pydantic, jmespath, beautifulsoup4, python-dateutil, pyyaml

TIER 3 - Extended (Premium): Heavier data processing - pandas, numpy, jinja2, openpyxl, pillow, lxml

TIER 4 - Custom (Premium, BYO): Enterprise brings their own sandbox image with any packages they need

## Tier Availability
- OSS: Standard + Common
- Premium: Standard + Common + Extended + Custom

## Pre-Built Sandbox Images
- ael/sandbox:standard → Python stdlib only (~50MB)
- ael/sandbox:common → + common packages (~150MB)
- ael/sandbox:extended → + pandas/numpy/etc (~500MB)

Key principle: No dynamic package installation. All packages pre-installed.

## BYO Container (Premium)
Enterprise provides: Dockerfile extending ael/sandbox-base, package manifest, security attestation, custom import whitelist.
AEL provides: Base sandbox image, documentation, optional scanning integration.
Critical: BYO containers are customer's responsibility for security.

## Security Per Tier
- Standard: Maintained by Python/AEL
- Common/Extended: Maintained by AEL, CVE scanned, monthly updates
- Custom: Customer's responsibility

## Import Validation
All code goes through AST-based import validation regardless of tier.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-004")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-004")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-004")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-004")
SORT decided_at DESC
```