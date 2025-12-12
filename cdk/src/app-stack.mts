import {Construct} from "constructs";
import {ExtendedStack, ExtendedStackProps} from "truemark-cdk-lib/aws-cdk";
import {RemovalPolicy} from "aws-cdk-lib";
import {AppUrl, Env, LogLevel, Zone} from './globals.mjs';
import {Bucket} from "aws-cdk-lib/aws-s3";
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import {StandardFargateCluster, StandardFargateService} from "truemark-cdk-lib/aws-ecs";

export interface BookstackProps extends ExtendedStackProps {
  readonly removalPolicy?: RemovalPolicy;
  readonly appEnv: Env;
  readonly logLevel: LogLevel;
  readonly zone: Zone;
  // Infrastructure wiring
  readonly vpcId: string;
  readonly databaseHost: string;
  readonly databaseSecretName: string;
}

 export class BookStack extends ExtendedStack {
   public readonly cluster: StandardFargateCluster;
   public readonly service: StandardFargateService;
   public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

   constructor(scope: Construct, id: string, props: BookstackProps) {
     super(scope, id, props);

     // Bucket used by BookStack for attachments and file storage
     const assetsBucket = new Bucket(this, 'AssetsBucket', {
       removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
       autoDeleteObjects: true,
       publicReadAccess: false,
       blockPublicAccess: {
         blockPublicAcls: false,
         blockPublicPolicy: true,
         ignorePublicAcls: false,
         restrictPublicBuckets: true,
       }
     });

     // Use existing VPC (looked up by VPC ID from props)
     const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });

     // ECS cluster hosting the BookStack service (Fargate)
     this.cluster = new StandardFargateCluster(this, 'Cluster', {
       vpc,
       clusterName: 'bookstack-cluster',
       containerInsights: false,
       enableExecuteCommandLog: true,
     });

     // Resolve DB password secret from Secrets Manager (key: "password")
     const dbSecret = secretsmanager.Secret.fromSecretNameV2(
       this,
       'DbSecretLookup',
       props.databaseSecretName,
     );
     const dbPasswordSecret = ecs.Secret.fromSecretsManager(dbSecret, 'password');

     // Resolve APP_KEY from SSM Parameter Store (SecureString)
     const appKeyParameter = ssm.StringParameter.fromSecureStringParameterAttributes(
       this,
       'BookstackAppKeyParam',
       {
         parameterName: '/app/bookstack/app_key',
         version: 1,
       },
     );

     // ECS Fargate service for BookStack
     this.service = new StandardFargateService(this, 'BookstackService', {
       cluster: this.cluster.cluster,
       serviceName: 'bookstack-service',
       image: ecs.ContainerImage.fromRegistry('ghcr.io/linuxserver/bookstack:latest'),
       port: 80,
       cpu: 1024,
       memoryLimitMiB: 2048,
       desiredCount: 1,
       vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
       environment: {
         APP_LANG: 'en',
         APP_URL: `https://${AppUrl.DevOregon}`,
         DB_HOST: props.databaseHost,
         DB_USERNAME: 'bookstack',
         DB_DATABASE: 'bookstack',
         STORAGE_TYPE: 's3',
         STORAGE_S3_BUCKET: assetsBucket.bucketName,
         STORAGE_S3_REGION: this.region,
       },
       secrets: {
         DB_PASSWORD: dbPasswordSecret,
         APP_KEY: ecs.Secret.fromSsmParameter(appKeyParameter),
       },
       enableRollback: true,
       enableExecuteCommand: true,
       cpuArchitecture: ecs.CpuArchitecture.ARM64,
    });

     // ========= Load Balancer =========
     // Security group for the public Application Load Balancer (ALB)
     const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
       vpc,
       description: 'ALB security group for Bookstack',
       allowAllOutbound: true,
     });
     // Allow inbound HTTP/HTTPS from the Internet (HTTP only used for redirect)
     albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP for redirect');
     albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS');

     // Internet-facing ALB in public subnets
     this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
       vpc,
       internetFacing: true,
       securityGroup: albSecurityGroup,
       vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
     });

     // Listener on 80 that redirects to HTTPS (443)
     const httpListener = this.loadBalancer.addListener('HttpListener', {
       port: 80,
       open: true,
       defaultAction: elbv2.ListenerAction.redirect({
         protocol: 'HTTPS',
         port: '443',
         permanent: true,
       }),
     });

     // Hosted zone: prefer lookup by domain. In CI, rely on committed cdk.context.json
     // to avoid live lookups and role assumptions.
     const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
       domainName: props.zone,
     });

     // ACM certificate for the app hostname (use non-deprecated Certificate API)
     const certificate = new acm.Certificate(this, 'AppCertificate', {
       domainName: AppUrl.DevOregon,
       validation: acm.CertificateValidation.fromDns(hostedZone),
     });

     // HTTPS listener forwarding to the ECS service (targets listen on port 80 internally)
     const httpsListener = this.loadBalancer.addListener('HttpsListener', {
       port: 443,
       open: true,
       certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
     });

     httpsListener.addTargets('EcsTargets', {
       port: 80,
       targets: [this.service.service],
       healthCheck: { path: '/', healthyHttpCodes: '200-399' },
     });

     // Allow ALB to reach the ECS service on port 80
     const serviceSecurityGroup = this.service.service.connections.securityGroups[0];
     serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(80), 'ALB to ECS service');

     // ========= Route53 record =========
     // Alias A record: <recordName>.<zone> → ALB DNS name
     // Derive record name from full host (AppUrl) and zone
     const recordName = AppUrl.DevOregon.replace(`.${props.zone}`, '');

     new route53.ARecord(this, 'AppAliasRecord', {
       zone: hostedZone,
       recordName,
       target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(this.loadBalancer)),
     });

     // Grant the task execution role permission to read the APP_KEY parameter
     const executionRole = this.service.taskDefinition.obtainExecutionRole();
     appKeyParameter.grantRead(executionRole);
     // Grant the task execution role S3 access for the assets bucket
     assetsBucket.grantReadWrite(executionRole);
     assetsBucket.grantPutAcl(executionRole);
   }
 }
