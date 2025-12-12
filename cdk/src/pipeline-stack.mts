import {ExtendedStack, ExtendedStackProps} from 'truemark-cdk-lib/aws-cdk';
import {Construct} from 'constructs';
import {
  CdkPipeline,
  NodePackageManager,
  NodeVersion,
} from 'truemark-cdk-lib/aws-codepipeline';
import {ComputeType} from 'aws-cdk-lib/aws-codebuild';
import {BookstackStage, RegionalStageProps} from "./regional-stage.mjs";

export interface PlatformPipelineStackProps extends ExtendedStackProps {
  readonly devMode?: boolean;
  readonly devSecondaryRegion?: AwsRegion;
  readonly repository: string;
  readonly branch: string;
  readonly accountIds?: string[];
}

export class PlatformPipelineStack extends ExtendedStack {
  constructor(scope: Construct, id: string, props: PlatformPipelineStackProps) {
    super(scope, id, props);

    // CDK pipeline building and deploying this repository from GitHub
    // const key = Key.fromLookup(this, 'Key', {
    //   aliasName: 'alias/cdk',
    // });

    const pipeline = new CdkPipeline(this, 'Pipeline', {
      pipelineName: 'Bookstack',
      cdkDirectory: 'cdk',
      connectionArn: Connection.DevGitHub,
      keyArn: "arn:aws:kms:us-west-2:659932761532:key/a5934ab8-76f0-4c9c-891a-6d2c0b396b55",
      repository: props.repository,
      branch: props.branch,
      accountIds: props.accountIds,
      packageManager: NodePackageManager.PNPM,
      nodeVersion: NodeVersion.NODE_22,
      commands: [
        'npm -g i pnpm',
        'pnpm -r i -frozen-lockfile --prefer-offline',
        'pnpm -r build',
        'pnpm -r test',
        'cd cdk',
        // Verbose synth to surface lookup/permission errors clearly in CodeBuild logs
        'pnpx cdk synth -v Platform',
      ],
      computeType: ComputeType.SMALL,
    });

    // Default settings for the Dev regional deployment
    const devRegionalDefaults: RegionalStageProps = {
      appEnv: 'dev',
      logLevel: 'info',
      canaryDeploy: false,
      zone: Zone.Dev,
    };

    // Single region example: us-west-2 (Oregon)
    const devOregon = new BookstackStage(this, `${id}-DevOregon`, {
      ...devRegionalDefaults,
      env: {account: this.account, region: AwsRegion.Oregon},
    });
    const devRegionalWave = pipeline.addWave('DevRegionalWave');
    devRegionalWave.addStage(devOregon);
  }
}
