/**
 * Counter-Strike POC — AWS infrastructure, Phase 1 (single ECS node).
 * See doc/aws-infra-design.md §2.
 *
 *   - Game server: one ECS Fargate task (ARM64) in a public subnet (no NAT),
 *     behind an ALB with WebSocket support + sticky sessions. No RDS, no Redis.
 *   - Client: S3 (private) served via CloudFront (HTTPS).
 *
 * Optional custom domain (context: domainName + hostedZoneId): adds ACM + Route53
 * so the ALB speaks WSS and CloudFront uses play.<domain>. Deploy in us-east-1 when
 * using a domain (CloudFront certs must live there).
 */
import * as fs from "fs";
import * as path from "path";
import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

const REPO_ROOT = path.join(__dirname, "..", "..");
const CLIENT_DIST = path.join(REPO_ROOT, "packages", "client", "dist");
const GAME_PORT = 2567;

export class CsInfraStackStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Optional custom domain (full WSS). Omit for a default-domain deploy.
    const domainName = this.node.tryGetContext("domainName") as string | undefined;
    const hostedZoneId = this.node.tryGetContext("hostedZoneId") as string | undefined;
    const useDomain = Boolean(domainName && hostedZoneId);

    // ── Networking: 2 AZs, public subnets only, no NAT (cost) ──────────────────
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });

    // ── Game server: one Fargate task (ARM64) in a public subnet ───────────────
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    taskDef.addContainer("server", {
      image: ecs.ContainerImage.fromAsset(REPO_ROOT, {
        file: "Dockerfile.server",
        platform: ecrAssets.Platform.LINUX_ARM64,
      }),
      environment: { PORT: String(GAME_PORT), NODE_ENV: "production" },
      portMappings: [{ containerPort: GAME_PORT }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "cs-server",
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true, // public subnet → egress to pull the image, no NAT
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      minHealthyPercent: 0, // single task: allow replace-in-place on deploy
      circuitBreaker: { rollback: true },
    });

    // ── ALB: TLS/WS termination + sticky sessions ──────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    });

    let albCert: acm.ICertificate | undefined;
    let cfCert: acm.ICertificate | undefined;
    let zone: route53.IHostedZone | undefined;
    if (useDomain) {
      zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId: hostedZoneId!,
        zoneName: domainName!,
      });
      // One cert covers the game (gs.) + client (play.) subdomains.
      const cert = new acm.Certificate(this, "Cert", {
        domainName: `gs.${domainName}`,
        subjectAlternativeNames: [`play.${domainName}`],
        validation: acm.CertificateValidation.fromDns(zone),
      });
      albCert = cert;
      cfCert = cert; // requires deploying this stack in us-east-1
    }

    const listener = alb.addListener("Listener", {
      port: useDomain ? 443 : 80,
      protocol: useDomain
        ? elbv2.ApplicationProtocol.HTTPS
        : elbv2.ApplicationProtocol.HTTP,
      certificates: albCert ? [albCert] : undefined,
      open: true,
    });

    listener.addTargets("Game", {
      port: GAME_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      // Colyseus answers /matchmake* with a fast HTTP status → liveness signal.
      healthCheck: {
        path: "/matchmake",
        healthyHttpCodes: "200-404",
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
      },
      // Keep a client's WebSocket pinned to its task (room affinity).
      stickinessCookieDuration: Duration.hours(2),
      deregistrationDelay: Duration.seconds(10),
    });

    if (useDomain) {
      new route53.ARecord(this, "GsRecord", {
        zone: zone!,
        recordName: `gs.${domainName}`,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
      });
    }

    // ── Client hosting: private S3 + CloudFront (HTTPS) ────────────────────────
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      // SPA: route unknown paths back to index.html.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      domainNames: useDomain ? [`play.${domainName}`] : undefined,
      certificate: cfCert,
    });

    if (useDomain) {
      new route53.ARecord(this, "PlayRecord", {
        zone: zone!,
        recordName: `play.${domainName}`,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    // Auto-upload the client build if present (run `pnpm --filter @cs/client build`
    // first). Otherwise the bucket deploys empty — sync it manually later.
    if (fs.existsSync(path.join(CLIENT_DIST, "index.html"))) {
      new s3deploy.BucketDeployment(this, "DeployClient", {
        sources: [s3deploy.Source.asset(CLIENT_DIST)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ["/*"],
      });
    }

    // ── Outputs ────────────────────────────────────────────────────────────────
    const gameUrl = useDomain ? `wss://gs.${domainName}` : `ws://${alb.loadBalancerDnsName}`;
    const playUrl = useDomain
      ? `https://play.${domainName}`
      : `https://${distribution.distributionDomainName}`;

    new CfnOutput(this, "ClientUrl", { value: playUrl });
    new CfnOutput(this, "GameServerUrl", {
      value: gameUrl,
      description: "Set VITE_SERVER_URL to this when building the client.",
    });
    new CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new CfnOutput(this, "CloudFrontDistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "AlbDnsName", { value: alb.loadBalancerDnsName });
  }
}
