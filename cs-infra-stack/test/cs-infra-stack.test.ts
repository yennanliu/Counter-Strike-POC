import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CsInfraStackStack } from "../lib/cs-infra-stack-stack";

const synth = (id: string) =>
  Template.fromStack(
    new CsInfraStackStack(new cdk.App(), id, {
      env: { account: "111111111111", region: "us-east-1" },
    }),
  );

test("Phase 1: single ECS node + ALB + CloudFront, and stays light", () => {
  const t = synth("Test1");
  t.resourceCountIs("AWS::ECS::Service", 1);
  t.hasResourceProperties("AWS::ECS::Service", { DesiredCount: 1 });
  t.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
  t.resourceCountIs("AWS::CloudFront::Distribution", 1);
  t.resourceCountIs("AWS::S3::Bucket", 1);

  // Phase 1 deliberately omits: database, cache, and NAT gateway.
  t.resourceCountIs("AWS::RDS::DBInstance", 0);
  t.resourceCountIs("AWS::ElastiCache::CacheCluster", 0);
  t.resourceCountIs("AWS::EC2::NatGateway", 0);
});

test("game target group: WebSocket sticky sessions + /matchmake health check", () => {
  const t = synth("Test2");
  t.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
    HealthCheckPath: "/matchmake",
    TargetGroupAttributes: Match.arrayWith([
      Match.objectLike({ Key: "stickiness.enabled", Value: "true" }),
    ]),
  });
});

test("Fargate task runs on ARM64", () => {
  const t = synth("Test3");
  t.hasResourceProperties("AWS::ECS::TaskDefinition", {
    RuntimePlatform: { CpuArchitecture: "ARM64", OperatingSystemFamily: "LINUX" },
  });
});
