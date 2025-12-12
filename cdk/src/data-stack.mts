import {Construct} from 'constructs';
import {ExtendedStack, ExtendedStackProps} from 'truemark-cdk-lib/aws-cdk';
import {Env, LogLevel, Vpc, Zone} from "./globals.mjs";
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import {RemovalPolicy, Duration} from "aws-cdk-lib";

export interface DataStackProps extends ExtendedStackProps {
  readonly removalPolicy?: RemovalPolicy;
  readonly appEnv: Env;
  readonly logLevel: LogLevel;
  readonly zone: Zone;
}

export class DataStack extends ExtendedStack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly databaseSecret: secretsmanager.Secret;
  public readonly databaseRecord?: route53.CnameRecord;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({username: 'bookstack'}),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: Vpc.DevOregon
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for Bookstack database',
    });

    dbSecurityGroup.applyRemovalPolicy(props?.removalPolicy ?? RemovalPolicy.DESTROY);
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(3306),
      'Allow MySQL from VPC',
    );

    const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_11_0,
      }),
      removalPolicy: props?.removalPolicy ?? RemovalPolicy.DESTROY,
    });

    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_11_0,
      }),
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      defaultDatabaseName: 'bookstack',
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      storageEncrypted: true,
      securityGroups: [dbSecurityGroup],
      parameterGroup: parameterGroup,
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        instanceIdentifier: 'bookstack-writer-01',
        publiclyAccessible: false,
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: false,
      }),
      backup: {
        retention: Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',
      removalPolicy: props?.removalPolicy || RemovalPolicy.DESTROY,
      deletionProtection: true,
    });
  }
}
