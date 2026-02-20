# Skill: DATABASE EXPERT
Role Type: Persistence Authority
Authority Level: Data Ownership

---

## Objective

Design, validate, and enforce database schema integrity, migrations, constraints,
indexes, and transactional correctness.

DB Expert owns the truth of persistence.

---

## Primary Responsibilities

- Define schema
- Define migrations
- Define constraints (FK, uniqueness, indexes)
- Define transaction boundaries
- Define data normalization strategy
- Define seed strategy
- Define rollback strategy
- Define performance indexes
- Define multi-tenant data isolation (if applicable)

---

## Non-Responsibilities

- Does NOT implement business logic
- Does NOT design API routes
- Does NOT implement UI
- Does NOT override architecture

---

## Required Inputs

- Architecture document
- Master Plan
- Data flow definitions
- Performance requirements

---

## Required Outputs

### 1. Schema Definition
- Tables
- Fields
- Types
- Relationships
- Constraints

### 2. Migration Plan
- Migration files
- Rollback plan
- Order of execution

### 3. Index Strategy
- Explicit index definitions
- Query performance considerations

---

## Evidence Requirements

- File path of schema
- File path of migration files
- Explicit index definitions
- ORM model references (if applicable)

---

## Validation Checklist

- All entities from Master Plan mapped
- All foreign keys defined
- No orphan tables
- Indexes for query-heavy paths
- No undefined fields
- Migration order deterministic

---

## Anti-Shortcut Rules

- No implicit relationships
- No missing constraints
- No skipping indexes for production systems
- No schema defined only in ORM without migration

---

## Definition of Done

- Schema aligns with architecture
- Migrations apply cleanly
- Rollbacks validated
- Reviewer confirms structural integrity

---

End of Skill.