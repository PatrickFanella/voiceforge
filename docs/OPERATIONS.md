# Production objectives and telemetry

Objectives: API availability 99.9%; p95 reads below 300 ms; p95 ordinary mutations below 500 ms; sync acknowledgement below 2 seconds; critical-safety enqueue below 10 seconds; RPO below 5 minutes; RTO below 60 minutes.

The API emits JSON logs with request IDs and redacts credentials, cookies, transcripts, audio URLs, signing secrets, and payloads. `/v1/metrics` exposes bounded request counts and latency summaries when authorized by `METRICS_TOKEN`. ECS Container Insights, ALB metrics, CloudWatch logs, and the Terraform dashboard provide the initial operational view. Production alarms cover API 5xx and p95 latency; queue-depth, task restart, RDS storage/replica, Redis memory, delivery dead-letter, and safety-latency alarms must be connected to the paging topic during environment provisioning.

OpenTelemetry export is configured through the ECS collector sidecar/environment in each deployment environment. Traces must carry request and workspace-safe correlation IDs, never record transcript/audio content, and annotate immutable deployment digests.
