# Backup and restore drill

Production RDS must have encryption, point-in-time recovery, and automated snapshots enabled. Run a restore drill at least quarterly into an isolated account or disposable database.

1. Restore the selected snapshot or PITR timestamp to a new RDS instance.
2. Set `DATABASE_URL` to the source/read-only comparison endpoint and `RESTORE_DATABASE_URL` to the restored disposable database.
3. Run `infra/scripts/verify-postgres-restore.sh` from a host with PostgreSQL client tools and network access.
4. Compare workspace, audit, submitted-time, and submitted-safety counts at the selected recovery point.
5. Run the API migration preflight and audit-chain validation against representative workspaces.
6. Record snapshot ARN, target timestamp, measured RPO/RTO, row-count evidence, chain-validation output, operator, and date in the drill ticket.
7. Destroy the restored instance and its temporary credentials after evidence is retained.

The drill fails if restoration exceeds 60 minutes, loses more than five minutes of committed data, migrations cannot start, or any representative audit chain fails validation.
