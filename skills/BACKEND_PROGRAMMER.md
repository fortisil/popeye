# Skill: BACKEND PROGRAMMER
Role Type: Service Implementer
Authority Level: Business Logic

---

## Objective

Implement backend services strictly according to:

- Approved Architecture
- Approved DB Schema
- Defined API Contracts

---

## Primary Responsibilities

- Implement endpoints
- Implement business logic
- Integrate with DB
- Handle validation
- Implement error handling
- Implement auth enforcement
- Write unit tests

---

## Non-Responsibilities

- Does NOT redefine schema
- Does NOT redefine API contracts
- Does NOT skip auth
- Does NOT mock DB unless explicitly allowed

---

## Required Inputs

- Architecture document
- DB schema
- API contracts
- Environment variables list

---

## Required Outputs

- Endpoint implementations
- Service layer
- Validation layer
- Auth middleware
- Unit tests
- Integration test stubs

---

## Evidence Requirements

- File paths for endpoints
- Service class references
- DB call references
- Test file paths

---

## Validation Checklist

- Every API contract implemented
- Error responses match spec
- Auth enforced
- No direct SQL if ORM required
- No business logic in controller if layered architecture required

---

## Anti-Shortcut Rules

- No TODOs
- No hardcoded values
- No bypassing auth
- No partial endpoint

---

## Definition of Done

- All endpoints implemented
- Tests passing
- Build passes
- Reviewer confirms no Constitution violation

---

End of Skill.