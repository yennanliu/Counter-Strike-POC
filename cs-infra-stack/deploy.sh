#!/usr/bin/env bash
# Build the server image, push it to a public registry, deploy the infra via CDK,
# and build + upload the browser client (pointed at the deployed game server).
#
# ECS pulls the image from a registry (it can't read your local Docker daemon), and
# we don't use ECR — so we push to Docker Hub (or any registry you're logged into).
# The client is a static bundle on S3+CloudFront; it needs the game server's URL
# baked in at build time (Vite `VITE_SERVER_URL` → `__SERVER_URL__`).
#
# Usage:
#   ./deploy.sh [IMAGE] [extra cdk args...]
#   ./deploy.sh docker.io/<user>/cs-server:latest
#   ./deploy.sh docker.io/<user>/cs-server:v2 -c domainName=example.com -c hostedZoneId=Z...
#
# Server URL baked into the client is resolved in this order:
#   1. $VITE_SERVER_URL if set (e.g. wss://gs.example.com)
#   2. wss://gs.<domain> if `-c domainName=<domain>` is passed
#   3. ws://<ALB-DNS> of the deployed stack (no-domain smoke test)
#
# IMAGE defaults to $SERVER_IMAGE or docker.io/yennanliu/cs-server:latest.
set -euo pipefail

IMAGE="${1:-${SERVER_IMAGE:-docker.io/yennanliu/cs-server:latest}}"
shift || true
EXTRA=("$@")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK="CsPhase1"
REGION="${CDK_DEFAULT_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"

out() { # read a CloudFormation stack output (empty string if stack/key absent)
  local v
  v="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue|[0]" --output text 2>/dev/null)"
  [ "$v" = "None" ] && v=""
  printf '%s' "$v"
}

# Parse `-c domainName=<x>` out of the extra cdk args, if present.
DOMAIN=""
for a in "${EXTRA[@]}"; do
  case "$a" in domainName=*) DOMAIN="${a#domainName=}";; esac
done

# Resolve the server URL to bake into the client (see header).
if [ -n "${VITE_SERVER_URL:-}" ]; then
  SERVER_URL="$VITE_SERVER_URL"
elif [ -n "$DOMAIN" ]; then
  SERVER_URL="wss://gs.$DOMAIN"
else
  PRIOR_ALB="$(out AlbDnsName)"   # empty on the very first deploy
  SERVER_URL="${PRIOR_ALB:+ws://$PRIOR_ALB}"
  SERVER_URL="${SERVER_URL:-ws://localhost:2567}"  # placeholder; fixed up post-deploy
fi

echo "▸ Building $IMAGE (linux/amd64) …"
docker build --platform linux/amd64 -f "$ROOT/Dockerfile.server" -t "$IMAGE" "$ROOT"

echo "▸ Pushing $IMAGE … (registry repo must be public, or ECS needs pull creds)"
docker push "$IMAGE"

echo "▸ Building client (VITE_SERVER_URL=$SERVER_URL) …"
VITE_SERVER_URL="$SERVER_URL" pnpm --filter @cs/client build

echo "▸ Deploying with serverImage=$IMAGE …"
cd "$ROOT/cs-infra-stack"
# CDK's BucketDeployment uploads packages/client/dist (just built) + invalidates CloudFront.
npx cdk deploy -c serverImage="$IMAGE" "${EXTRA[@]}"

# First no-domain deploy: the ALB DNS only exists now, so the client was built with a
# placeholder. Rebuild against the real ALB and re-upload.
if [ -z "${VITE_SERVER_URL:-}" ] && [ -z "$DOMAIN" ]; then
  ALB="$(out AlbDnsName)"; BUCKET="$(out SiteBucketName)"; DISTID="$(out CloudFrontDistributionId)"
  if [ -n "$ALB" ] && [ "ws://$ALB" != "$SERVER_URL" ]; then
    echo "▸ Rebuilding client against deployed ALB (ws://$ALB) and re-uploading …"
    VITE_SERVER_URL="ws://$ALB" pnpm --filter @cs/client build
    aws s3 sync "$ROOT/packages/client/dist" "s3://$BUCKET" --delete --region "$REGION"
    aws cloudfront create-invalidation --distribution-id "$DISTID" --paths '/*' >/dev/null
  fi
fi

echo ""
echo "✓ Done."
echo "  Client:  $(out ClientUrl)"
echo "  Server:  $(out GameServerUrl)"
case "$SERVER_URL" in
  ws://*) cat <<'NOTE'
  ⚠ Game server is ws:// (no TLS). Browsers block ws:// from the https:// CloudFront
    page (mixed content), so the hosted client loads but can't join a match. For real
    browser play, deploy with a domain (gives wss://):
      ./deploy.sh <image> -c domainName=example.com -c hostedZoneId=Z... (in us-east-1)
NOTE
  ;;
esac
