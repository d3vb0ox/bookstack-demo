import {Construct} from "constructs";
import {ExtendedStack, ExtendedStackProps} from "truemark-cdk-lib/aws-cdk";
import {RemovalPolicy} from "aws-cdk-lib";
import {AppUrl, Env, LogLevel, Zone} from './globals.mjs';
import {Bucket} from "aws-cdk-lib/aws-s3";
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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

     // Read APP_KEY from SSM Parameter Store (SecureString)
     const appKeyParam = ssm.StringParameter.fromStringParameterName(
       this,
       'BookstackAppKeyParam',
       '/app/bookstack/app_key',
     );

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
         APP_URL: AppUrl.DevOregon,
         DB_HOST: props.databaseHost,
         DB_USERNAME: 'bookstack',
         DB_DATABASE: 'bookstack',
         STORAGE_TYPE: 's3',
         STORAGE_S3_BUCKET: assetsBucket.bucketName,
         STORAGE_S3_REGION: this.region,
       },
       secrets: {
         DB_PASSWORD: dbPasswordSecret,
         APP_KEY: ecs.Secret.fromSsmParameter(appKeyParam),
       },
       enableRollback: true,
       enableExecuteCommand: true,
       cpuArchitecture: ecs.CpuArchitecture.ARM64,
     });

     // Allow the task execution role to read the SecureString from SSM
     const execRole = this.service.taskDefinition.obtainExecutionRole();
     appKeyParam.grantRead(execRole);

   }
 }
