# cs-infra-stack — AWS infra (Phase 1)

CDK app for **Phase 1** of [`doc/aws-infra-design.md`](../doc/aws-infra-design.md):
a single ECS Fargate game node behind an ALB, plus the static client on
S3 + CloudFront. **No RDS, no Redis** (matches aren't persisted in Phase 1).

The server image is **pulled from a public registry (Docker Hub)** — we do **not**
build/push to ECR. You build + push the image, then point CDK at it.

```
browser ──https──▶ CloudFront ──▶ S3 (client)
browser ──wss───▶  ALB (sticky) ──▶ Fargate ×1 (Colyseus)   ← pulls docker.io/<user>/cs-server
```

## What gets created
VPC (2 AZ, **public subnets, no NAT**) · ECS cluster + 1 Fargate task (x86_64) ·
ALB (WebSocket + sticky sessions, health check on `/matchmake`) · S3 bucket +
CloudFront (OAC) · CloudWatch logs. **No ECR.**

## Prerequisites
- AWS account + credentials (`aws configure`)
- A container registry account (e.g. **Docker Hub**) + **Docker** to build/push
- Node 20+, and a one-time `cdk bootstrap`

## Deploy

ECS pulls the image from a registry (not your local Docker), and we don't use ECR —
so the flow is **build locally → push to Docker Hub → CDK pulls it**.

**One command** (build + push + deploy):
```bash
cd cs-infra-stack
npm install
npx cdk bootstrap                                   # once per account/region
docker login                                        # once
./deploy.sh docker.io/<user>/cs-server:latest       # build (amd64) + push + cdk deploy
# add a domain:  ./deploy.sh docker.io/<user>/cs-server:latest -c domainName=example.com -c hostedZoneId=Z...
```

**Or the manual steps:**
```bash
# 1. Build + push the server image to a PUBLIC registry (from the repo root).
#    --platform linux/amd64 matches the x86_64 Fargate task (important on Apple Silicon).
docker build --platform linux/amd64 -f Dockerfile.server -t docker.io/<user>/cs-server:latest .
docker push docker.io/<user>/cs-server:latest       # make the repo public

# 2. Deploy, pointing CDK at that image
cd cs-infra-stack && npm install && npx cdk bootstrap
npx cdk deploy -c serverImage=docker.io/<user>/cs-server:latest
```

> CI publishes the image to Docker Hub automatically on push to `main` **if** the
> `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` repo secrets are set (otherwise it just
> builds to verify). Then you only need step 2.
>
> Default `serverImage` (if `-c` omitted) is `docker.io/yennanliu/cs-server:latest`.
> Private registry? Add `credentials` (Secrets Manager) on the container.

Outputs: **ClientUrl** (CloudFront), **GameServerUrl** (ALB), **ServerImage**,
**SiteBucketName**, **CloudFrontDistributionId**, **AlbDnsName**.

### Custom domain (needed for real browser play — WSS)
Browsers block insecure `ws://` from an `https://` page, so end-to-end play needs
TLS on the game server → a domain. Provide a Route 53 hosted zone and **deploy in
`us-east-1`** (CloudFront certs must live there):

```bash
export CDK_DEFAULT_REGION=us-east-1
VITE_SERVER_URL=wss://gs.example.com pnpm --filter @cs/client build   # so the client gets the right URL
npx cdk deploy \
  -c serverImage=docker.io/<user>/cs-server:latest \
  -c domainName=example.com -c hostedZoneId=Z0123456789ABCDEFGHIJ
```
Serves the client at `https://play.example.com` and the game at `wss://gs.example.com`.

### Without a domain (infra smoke test)
`npx cdk deploy -c serverImage=…` brings everything up on default domains: client on
`https://<dist>.cloudfront.net`, server on `ws://<alb-dns>`. The server is live
(`http://<alb-dns>/matchmake` → 404 = healthy) but the CloudFront-hosted client
can't reach `ws://` it (mixed content) — use a domain for browser play.

## Manual client upload (if you didn't build before deploy)
```bash
VITE_SERVER_URL=wss://gs.example.com pnpm --filter @cs/client build
aws s3 sync packages/client/dist s3://<SiteBucketName> --delete
aws cloudfront create-invalidation --distribution-id <CloudFrontDistributionId> --paths '/*'
```

## Teardown
```bash
npx cdk destroy
```

## Cost (idle, Phase 1)
~1 small Fargate task + 1 ALB + CloudFront/S3 → low tens of USD/month. No NAT, no
RDS, no Redis, no ECR. Scale-out, persistence, and CI/CD come in later phases.

## CDK commands
`npm run build` · `npm test` · `npx cdk synth` · `npx cdk diff` · `npx cdk deploy` · `npx cdk destroy`
