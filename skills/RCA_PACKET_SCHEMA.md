# RCA PACKET SCHEMA
Purpose: Machine-verifiable root cause analysis artifact.

Required Fields:

- rca_id (UUID)
- timestamp
- incident_type
- severity
- reproduction_steps
- affected_files[]
- execution_trace
- root_cause_statement
- responsible_layer
- origin_phase
- governance_gap
- recommended_fix_owner
- requires_consensus (boolean)
- requires_change_request (boolean)

No vague root cause allowed.
Must identify structural origin.