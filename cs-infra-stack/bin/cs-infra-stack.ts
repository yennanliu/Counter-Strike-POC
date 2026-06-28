#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CsInfraStackStack } from "../lib/cs-infra-stack-stack";

const app = new cdk.App();

new CsInfraStackStack(app, "CsPhase1", {
  // Use the CLI's account/region (from `aws configure` / env). For a custom
  // domain, deploy in us-east-1 (CloudFront certs must live there).
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: "Counter-Strike POC — Phase 1 (single ECS node + CloudFront)",
});
