# cs-infra-stack — AWS infra (Phase 1)

CDK app for **Phase 1** of [`doc/aws-infra-design.md`](../doc/aws-infra-design.md):
a single ECS Fargate game node behind an ALB, plus the static client on
S3 + CloudFront. **No RDS, no Redis** (matches aren't persisted in Phase 1).

```
browser ──https──▶ CloudFront ──▶ S3 (client)
browser ──wss───▶  ALB (sticky) ──▶ Fargate ×1 (Colyseus)   ← image built from ../Dockerfile.server
```

## What gets created
VPC (2 AZ, **public subnets, no NAT**) · ECS cluster + 1 Fargate task (ARM64) ·
ALB (WebSocket + sticky sessions, health check on `/matchmake`) · S3 bucket +
CloudFront (OAC) · CloudWatch logs. The server image is built from
`../Dockerfile.server` by CDK at deploy time.

## Prerequisites
- AWS account + credentials (`aws configure`)
- **Docker** running (CDK builds the server image)
- Node 20+, and a one-time `cdk bootstrap`

## Deploy

```bash
cd cs-infra-stack
npm install
npx cdk bootstrap                 # once per account/region
npx cdk deploy
```

Outputs: **ClientUrl** (CloudFront), **GameServerUrl** (ALB), **SiteBucketName**,
**CloudFrontDistributionId**, **AlbDnsName**.

### Custom domain (needed for real browser play — WSS)
Browsers block insecure `ws://` from an `https://` page, so end-to-end play needs
TLS on the game server → a domain. Provide a Route 53 hosted zone and **deploy in
`us-east-1`** (CloudFront certs must live there):

```bash
export CDK_DEFAULT_REGION=us-east-1
# build the client pointed at the game server so it's uploaded with the right URL:
VITE_SERVER_URL=wss://gs.example.com pnpm --filter @cs/client build
npx cdk deploy -c domainName=example.com -c hostedZoneId=Z0123456789ABCDEFGHIJ
```
Serves the client at `https://play.example.com` and the game at `wss://gs.example.com`.

### Without a domain (infra smoke test)
`npx cdk deploy` (no context) brings everything up on default domains: client on
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
RDS, no Redis. Scale-out, persistence, and CI/CD come in later phases.

## CDK commands
`npm run build` (compile) · `npx cdk synth` (template) · `npx cdk diff` · `npx cdk deploy` · `npx cdk destroy`
