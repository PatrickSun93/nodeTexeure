# 0004 — Deploy to single-node k3s, with MySQL in the cluster

Status: Accepted (2026-10-30). Code in `infra/` and `.github/workflows/deploy.yml`.

## Context

Until now, production meant `docker compose -f docker-compose.prod.yml up` on
whichever host someone set up by hand. CI built the Rust image but never pushed
or deployed anything. The stack is seven processes:

- MySQL, the Node backend, the Rust API, worker and email daemon;
- two Next.js apps.

Its traffic is a small shop's. The budget is a few euros a month.

Requirements:

- A push to `main` with green CI reaches production without anyone logging in.
- A release that doesn't come up healthy is rolled back automatically.
- The whole setup is reproducible from the repository (infrastructure as code).
- Secrets stay out of the repository.

## Options

1. **Managed Kubernetes** (DOKS, GKE Autopilot, EKS) plus a managed MySQL.
2. **Single-node k3s on one VM**, MySQL as a StatefulSet on the node's disk.
3. **Compose on a VM**, deployed over SSH (`docker compose pull && up -d`).
4. **A PaaS** (Fly.io, Render, Railway).

## Decision

Option 2:

- Terraform creates one Hetzner CX22 with a firewall that admits only 22, 80
  and 443.
- cloud-init installs k3s, which brings Traefik and local-path storage, plus
  cert-manager.
- kustomize describes the services in `infra/k8s/`.
- GitHub Actions does the rest:
  - pushes images to GHCR tagged with the commit SHA;
  - applies the manifests through an SSH tunnel to the API server;
  - waits on `rollout status`, checks that `/health` reports the new SHA;
  - runs `rollout undo` when either check fails.

Why not the others:

- **Managed Kubernetes** costs €25–80/month before the database, for
  availability this shop does not need yet. A managed MySQL alone costs more
  than the VM.
- **Compose over SSH** gives no readiness-gated rollout or one-command rollback
  without writing both by hand.
- **A PaaS** fits the two Next.js apps but not a MySQL with triggers and a
  custom `get_next_id()` function, nor the long-running worker and daemon.

k3s costs about €5/month. It runs the same API, objects and probes as any
cluster, so the manifests move to managed Kubernetes unchanged when the shop
outgrows one box.

**Where MySQL lives.** It runs in the cluster as a StatefulSet on a
local-path volume. This is the same model as the compose `mysql` service:

- `init.sql` initializes the schema on first start;
- the backend applies migrations on every start.

The alternative was a managed database, rejected on cost (see above). Running
MySQL on the host outside k3s was also rejected: it would be a second thing to
provision and upgrade outside the manifests.

**Kubernetes API access.** The API server is not exposed. The workflow tunnels
over SSH, so the firewall stays at three ports and the k3s client certificate
never leaves the node except over that SSH session.

**Secrets.** They come from GitHub: one `APP_ENV` secret in dotenv form becomes
the `app-env` Secret. It has the same keys as `backend/.env`, so compose and
k8s read one format.

## Consequences

- **One node is a single point of failure.** A VM or disk loss takes the shop
  down and loses data written since the last backup. Backups (Hetzner snapshots
  or a `mysqldump` cron off the box) are an operator task, not automated here.
  The README says so.
- **Deploys are not zero-downtime for MySQL changes.** Application pods roll
  one at a time behind readiness probes. A migration that breaks the old
  version would still need care. That is the same as with compose.
- **Rollback is per Deployment.** It does not reverse migrations or data
  changes. Migrations are written to be additive for that reason.
- **The worker does not run migrations in Kubernetes** (`WORKER_MIGRATE=false`).
  The backend's entrypoint does, so the Rust image doesn't need
  `backend/migrations`. If the Node backend is retired, the worker or an init
  Job has to take this over.
- **Some values are in the manifests rather than parameters**: the GHCR owner
  (`ghcr.io/patricksun93`) and the per-pod resource requests. They are sized
  to fit the whole stack in about 2 GB.
- **Moving to managed Kubernetes later:**
  - replace `terraform/` (the cluster) and the MySQL StatefulSet (the
    database);
  - point the deploy job at the new cluster;
  - `k8s/base` stays.
