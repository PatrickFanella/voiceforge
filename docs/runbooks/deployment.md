# Deployment and rollback

VoiceForge builds each container once, identifies it by digest, scans it, generates an SBOM, and signs it with GitHub OIDC. Staging and production promote the same immutable digest.

1. Run the complete repository and integration gates.
2. Build and scan API, worker, and admin images. Any high or critical finding blocks promotion unless an approved exception exists.
3. Run the migration task before service rollout. Migrations must follow expand/migrate/contract compatibility and be safe for the currently running release.
4. Terraform updates ECS services with 100% minimum health and the deployment circuit breaker enabled.
5. Run deep health verification and the staging real-device/provider exercises.
6. Watch ALB p95 latency, 5xx rate, task restarts, queue depth, and critical-safety delivery latency for at least 15 minutes.

If verification or alarms fail, stop promotion. ECS automatically rolls back failed deployments. For a manual rollback, update Terraform image variables to the last known-good digests and reapply; never rebuild an old tag. Database rollback uses a compatible forward migration unless the disaster-recovery runbook is invoked.
