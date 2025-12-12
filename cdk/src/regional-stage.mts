import {ExtendedStage, ExtendedStageProps} from 'truemark-cdk-lib/aws-cdk';
import {Construct} from 'constructs';
import {AwsRegion, Env, LogLevel, Zone} from './globals.mjs';
import {BookStack} from './app-stack.mjs';

export interface RegionalStageProps extends ExtendedStageProps {
  readonly appEnv: Env;
  readonly logLevel: LogLevel;
  readonly canaryDeploy: boolean;
  readonly zone: Zone;
}

export class BookstackStage extends ExtendedStage {
  constructor(scope: Construct, id: string, props: RegionalStageProps) {
    super(scope, id, props);

    const BookstackStack = new BookStack(this, 'Bookstack', {
      ...props,
      env: {account: this.account, region: AwsRegion.Oregon},
    });
  }
}
