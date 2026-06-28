#!/usr/bin/env bash
# Build the server image locally, push it to a public registry, and deploy via CDK.
#
# ECS pulls the image from a registry (it can't read your local Docker daemon), and
# we don't use ECR — so we push to Docker Hub (or any registry you're logged into).
#
# Usage:
#   ./deploy.sh [IMAGE] [extra cdk args...]
#   ./deploy.sh docker.io/<user>/cs-server:latest
#   ./deploy.sh docker.io/<user>/cs-server:v2 -c domainName=example.com -c hostedZoneId=Z...
#
# IMAGE defaults to $SERVER_IMAGE or docker.io/yennanliu/cs-server:latest.
set -euo pipefail

IMAGE="${1:-${SERVER_IMAGE:-docker.io/yennanliu/cs-server:latest}}"
shift || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▸ Building $IMAGE (linux/amd64) …"
docker build --platform linux/amd64 -f "$ROOT/Dockerfile.server" -t "$IMAGE" "$ROOT"

echo "▸ Pushing $IMAGE … (registry repo must be public, or ECS needs pull creds)"
docker push "$IMAGE"

echo "▸ Deploying with serverImage=$IMAGE …"
cd "$ROOT/cs-infra-stack"
npx cdk deploy -c serverImage="$IMAGE" "$@"
