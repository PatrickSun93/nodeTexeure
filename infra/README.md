# Infrastructure

One Hetzner VM running single-node k3s, provisioned with Terraform. Kubernetes
manifests live in `k8s/`, and GitHub Actions deploys every green commit on
`main` (`.github/workflows/deploy.yml`). Why this shape:
[docs/adr/0004](../docs/adr/0004-single-node-k3s-with-in-cluster-mysql.md).

```
terraform/   VM, firewall (22/80/443 only), SSH key; cloud-init installs k3s + cert-manager
k8s/base/    the docker-compose.prod.yml services: mysql (StatefulSet), backend, api,
             worker, email-daemon, frontend, admin-dashboard, uploads PVC, Ingress
k8s/overlays/prod/   GHCR images at the deployed SHA, Let's Encrypt ClusterIssuer
```

Cost: a CX22 (2 vCPU, 4 GB, 40 GB disk) with an IPv4 address is about €5/month.

## 1. Create the server

Needs Terraform ≥ 1.6, a Hetzner Cloud project and an API token with read/write access.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars     # ssh key path, server type, location
export TF_VAR_hcloud_token=...                    # never in a file
terraform init
terraform apply
terraform output                                  # ipv4, nip_io_domain, kubeconfig
```

State is local (`terraform.tfstate`, gitignored). Keep it, because `destroy`
and later changes need it. Move it to a remote backend before anyone else runs
`apply`.

First boot takes 2–3 minutes. cloud-init installs k3s (Traefik and local-path
storage included) and drops a HelmChart that installs cert-manager.

## 2. kubectl from your machine

The firewall does not open 6443, so reach the API server over SSH:

```bash
IP=$(terraform output -raw ipv4)
ssh root@$IP cat /etc/rancher/k3s/k3s.yaml > ~/.kube/nodetexeure.yaml   # server: https://127.0.0.1:6443
ssh -fN -L 6443:127.0.0.1:6443 root@$IP                                 # tunnel
export KUBECONFIG=~/.kube/nodetexeure.yaml
kubectl get nodes
kubectl -n nodetexeure get pods
```

## 3. Configure GitHub

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| secret | `DEPLOY_SSH_KEY` | private key matching `ssh_public_key_path` |
| secret | `APP_ENV` | the app environment in dotenv form: at least `DB_PASSWORD`, `JWT_SECRET`, `NEXTAUTH_SECRET`, plus `FRONTEND_URL=https://shop.<domain>`, `CORS_ORIGINS=https://shop.<domain>,https://admin.<domain>`, `TRUST_PROXY=1` (docs/DEPLOYMENT.md) and any Stripe / SES / S3 / FedEx keys (see `backend/.env.example`) |
| secret | `DEPLOY_KNOWN_HOSTS` | optional: `ssh-keyscan <ip>` output. Without it, the workflow trusts the host key on first use. |
| secret | `GHCR_PULL_TOKEN` | optional: a `read:packages` token, needed only if the GHCR packages stay private |
| variable | `DEPLOY_HOST` | `terraform output -raw ipv4` |
| variable | `DOMAIN` | `terraform output -raw nip_io_domain`, or your own domain with `shop.` and `admin.` A records |
| variable | `ACME_EMAIL` | address for Let's Encrypt expiry notices |

Until `DEPLOY_SSH_KEY` and `DEPLOY_HOST` exist, the Deploy workflow is skipped
and not marked as failed.

GHCR packages start private. Either make the four `nodetexeure-*` packages
public after the first push (Package settings → Change visibility), or set
`GHCR_PULL_TOKEN`.

## 4. What a deploy does

On every push to `main` whose CI passed, or on a manual "Run workflow":

1. Build `frontend`, `admin`, `backend` and `rust` and push them to
   `ghcr.io/<owner>/nodetexeure-*:<sha>`. The proxy targets are baked into
   the Next.js builds as in compose (`http://backend:6666`, `http://api:7000`).
2. Open an SSH tunnel and read the kubeconfig from the node.
3. Create or update:
   - Secret `app-env` from `APP_ENV`;
   - ConfigMap `mysql-init` from `docker/mysql/init.sql`;
   - the pull secret, when `GHCR_PULL_TOKEN` is set.
4. Render `k8s/overlays/prod` and fill in `__IMAGE_TAG__`, `__DOMAIN__` and
   `__ACME_EMAIL__`, then `kubectl apply`.
5. Wait for `kubectl rollout status` on MySQL and every Deployment. Then poll
   `https://shop.<domain>/health` until it reports the new SHA.
6. If a rollout doesn't become ready, or `/health` never shows the new SHA,
   run `kubectl rollout undo` on every Deployment and fail the run.

Probes:

| Workload | Readiness | Liveness |
|---|---|---|
| backend | `/api/status/health` (503 without MySQL) | TCP |
| api | `/health` (503 without MySQL) | TCP |
| frontend | `/health` (the process; reports `GIT_SHA`) | `/health` |
| admin-dashboard | `/api/health` (503 when the backend is unreachable) | TCP |
| mysql | `mysqladmin ping` | TCP |
| worker, email-daemon | none (no HTTP); a crash restarts the pod | — |

Liveness checks the process rather than the database, so a MySQL outage takes
pods out of rotation without restarting them all.

Migrations run where they do in compose. The backend's entrypoint applies
`backend/migrations` under the MySQL migration lock. The worker runs with
`WORKER_MIGRATE=false`, so its image doesn't need the SQL files.

## Operations

```bash
kubectl -n nodetexeure logs deploy/api -f
kubectl -n nodetexeure rollout undo deploy/frontend          # manual rollback
kubectl -n nodetexeure exec -it mysql-0 -- sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" bed_texture_ecommerce' > backup.sql
kubectl -n nodetexeure exec -it deploy/backend -- npm run seed:rnd   # demo data (not run automatically)
```

MySQL data and uploads sit on the VM's disk (`/var/lib/rancher/k3s/storage`).
Back them up off the box, either with Hetzner snapshots or a dump cron. ADR
0004 covers what that trade-off means.

Tear down: `terraform destroy`. This deletes the VM, and the database with it.
