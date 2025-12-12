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

     const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });

     this.cluster = new StandardFargateCluster(this, 'Cluster', {
       vpc,
       clusterName: 'bookstack-cluster',
       containerInsights: false,
       enableExecuteCommandLog: true,
     });

     // Simple ECS Fargate service for Bookstack
     // Resolve DB password secret from name and key
     const dbSecretSm = secretsmanager.Secret.fromSecretNameV2(
       this,
       'DbSecretLookup',
       props.databaseSecretName,
     );
     const dbPasswordSecret = ecs.Secret.fromSecretsManager(dbSecretSm, 'password');

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
         APP_KEY: 'base64:dfaME0JYNQ4u3NI4YfFkcLUv4Vm19TYGL/43Kl0UZ0A=',
         DB_HOST: props.databaseHost,
         DB_USERNAME: 'bookstack',
         DB_DATABASE: 'bookstack',
         STORAGE_TYPE: 's3',
         STORAGE_S3_BUCKET: assetsBucket.bucketName,
         STORAGE_S3_REGION: this.region,
       },
       secrets: {
         DB_PASSWORD: dbPasswordSecret,
       },
       enableRollback: true,
       enableExecuteCommand: true,
       cpuArchitecture: ecs.CpuArchitecture.ARM64,
     });

     // ========= Load Balancer =========
     // Security group for ALB
     const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
       vpc,
       description: 'ALB security group for Bookstack',
       allowAllOutbound: true,
     });
     // Allow inbound HTTP/HTTPS from the Internet
     albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP for redirect');
     albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS');

     // Internet-facing ALB
     this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
       vpc,
       internetFacing: true,
       securityGroup: albSecurityGroup,
       vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
     });

     const httpListener = this.loadBalancer.addListener('HttpListener', {
       port: 80,
       open: true,
       defaultAction: elbv2.ListenerAction.redirect({
         protocol: 'HTTPS',
         port: '443',
         permanent: true,
       }),
     });

     // Create ACM certificate for HTTPS (DNS validated)
     const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
       domainName: props.zone,
     });

     const certificate = new acm.DnsValidatedCertificate(this, 'AppCertificate', {
       domainName: AppUrl.DevOregon,
       hostedZone,
       region: this.region, // certificate must be in same region as ALB
     });

     // HTTPS listener forwarding to ECS targets
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

     // Allow ALB to reach the service on port 80
     const serviceSg = this.service.service.connections.securityGroups[0];
     serviceSg.addIngressRule(albSecurityGroup, ec2.Port.tcp(80), 'ALB to ECS service');

     // ========= Route53 record =========
     // Derive record name from AppUrl and zone
     const recordName = AppUrl.DevOregon.replace(`.${props.zone}`, '');

     new route53.ARecord(this, 'AppAliasRecord', {
       zone: hostedZone,
       recordName,
       target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(this.loadBalancer)),
     });

     // Allow task execution role to read SSM SecureString
     const execRole = this.service.taskDefinition.obtainExecutionRole();
     assetsBucket.grantReadWrite(execRole);
     assetsBucket.grantPutAcl(execRole);
   }
 }
