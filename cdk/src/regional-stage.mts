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

    // First deploy the data layer (Aurora MySQL + secret)
    const dataStack = new DataStack(this, 'Data', {
      ...props,
      env: { account: this.account, region: AwsRegion.Oregon },
    });

    // Then deploy the app layer and wire DB endpoint + secret name into it
    const app = new BookStack(this, 'Bookstack', {
      ...props,
      vpcId: Vpc.DevOregon,
      databaseHost: dataStack.cluster.clusterEndpoint.hostname,
      databaseSecretName: dataStack.databaseSecret.secretName,
      env: { account: this.account, region: AwsRegion.Oregon },
    });
  }
}
