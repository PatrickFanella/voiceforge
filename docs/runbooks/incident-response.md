# Incident response

Severity 1 includes cross-workspace exposure, unavailable safety triage, confirmed credential compromise, or sustained API unavailability. Page the incident commander and security owner, preserve logs/audit evidence, and establish a timestamped incident channel.

- Contain: disable affected credentials/endpoints, isolate tasks, or apply the WAF block without deleting evidence.
- Assess: inspect CloudWatch deployment annotations, ALB metrics, ECS events, RDS/Redis health, BullMQ depth, and redacted request IDs.
- Recover: roll back immutable images, scale workers, replay dead-letter deliveries, or execute PITR as appropriate.
- Validate: run tenant-isolation probes, audit-chain validation, critical escalation drill, and customer-impact queries.
- Communicate: state confirmed facts, affected windows/workspaces, mitigation, and next update time. Follow contractual and legal notification requirements.
- Learn: complete a blameless review, record RTO/RPO, add regression tests, and rotate temporary credentials.
