import {ExtendedStage, ExtendedStageProps} from 'truemark-cdk-lib/aws-cdk';
import {Construct} from 'constructs';
import {AwsRegion, Env, LogLevel, Vpc, Zone} from './globals.mjs';
import {BookStack} from './app-stack.mjs';
import {DataStack} from './data-stack.mjs';

export interface RegionalStageProps extends ExtendedStageProps {
  readonly appEnv: Env;
  readonly logLevel: LogLevel;
  readonly canaryDeploy: boolean;
  readonly zone: Zone;
}

export class BookstackStage extends ExtendedStage {
  constructor(scope: Construct, id: string, props: RegionalStageProps) {
    super(scope, id, props);

    // First: data layer
    const data = new DataStack(this, 'Data', {
      ...props,
      env: { account: this.account, region: AwsRegion.Oregon },
    });

    // Then: app layer, wiring DB details via env/secrets
    const app = new BookStack(this, 'Bookstack', {
      ...props,
      vpcId: Vpc.DevOregon,
      databaseHost: data.cluster.clusterEndpoint.hostname,
      databaseSecretName: data.databaseSecret.secretName,
      env: { account: this.account, region: AwsRegion.Oregon },
    });
  }
}
