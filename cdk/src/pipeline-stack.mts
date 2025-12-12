import {ExtendedStack, ExtendedStackProps} from 'truemark-cdk-lib/aws-cdk';
import {Construct} from 'constructs';
import {Key} from 'aws-cdk-lib/aws-kms';
import {
  CdkPipeline,
  NodePackageManager,
  NodeVersion,
} from 'truemark-cdk-lib/aws-codepipeline';
import {ComputeType} from 'aws-cdk-lib/aws-codebuild';
import {AwsAccount, AwsRegion, Connection, Zone} from './globals.mjs';
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

    // const key = Key.fromLookup(this, 'Key', {
    //   aliasName: 'alias/cdk',
    // });

    const pipeline = new CdkPipeline(this, 'Pipeline', {
      pipelineName: 'Platform',
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
        'pnpx cdk synth Platform',
      ],
      computeType: ComputeType.SMALL,
    });

    const devRegionalDefaults: RegionalStageProps = {
      appEnv: 'dev',
      logLevel: 'info',
      canaryDeploy: false,
      zone: Zone.Dev,
    };

    const devOregon = new BookstackStage(this, `${id}-DevOregon`, {
      ...devRegionalDefaults,
      env: {account: this.account, region: AwsRegion.Oregon},
    });
    const devRegionalWave = pipeline.addWave('DevRegionalWave');
    devRegionalWave.addStage(devOregon);

    // const dev = new
    //
    // if (props.devMode) {
    //   ///////////////////////////////////////////////////////////////////////////
    //   // Dev
    //   ///////////////////////////////////////////////////////////////////////////
    //   // const devGlobal = new GlobalStage(this, `${id}-DevGlobal`, {
    //   //   replicationRegions: [],
    //   //   removalPolicy: RemovalPolicy.DESTROY,
    //   //   env: {
    //   //     account: this.account,
    //   //     region: AwsRegion.Ohio,
    //   //   },
    //   // });
    //   // pipeline.addStage(devGlobal, {
    //   //   pre: [
    //   //     new ManualApprovalStep('ManualApproval', {
    //   //       comment: 'Approve deployment to Dev',
    //   //     }),
    //   //   ],
    //   // });
    //   const devRegionalDefaults: RegionalStageProps = {
    //     appEnv: 'dev',
    //     // dataStackParameterExportOptions:
    //     //   devGlobal.dataStackParameterExportOptions,
    //     logLevel: 'info',
    //     canaryDeploy: false,
    //     zone: Zone.Dev,
    //   };
    //   const devOhio = new RegionalStage(this, `${id}-DevOhio`, {
    //     ...devRegionalDefaults,
    //     env: {account: this.account, region: AwsRegion.Ohio},
    //   });
    //   const devRegionalWave = pipeline.addWave('DevRegionalWave');
    //   devRegionalWave.addStage(devOhio);
    //
    //   const devEdge = new EdgeStage(this, `${id}-DevEdge`, {
    //     websiteStackParameterExportOptions:
    //     devOhio.websiteStackParameterExportOptions,
    //     zone: Zone.Dev,
    //     robotsBehavior: 'Disallow',
    //     env: {account: this.account, region: AwsRegion.Virginia},
    //   });
    //   pipeline.addStage(devEdge);
    // } else {
    //   ///////////////////////////////////////////////////////////////////////////
    //   // Stage
    //   ///////////////////////////////////////////////////////////////////////////
    //   // const stageGlobal = new GlobalStage(this, `${id}-StageGlobal`, {
    //   //   replicationRegions: [],
    //   //   removalPolicy: RemovalPolicy.DESTROY,
    //   //   env: {account: AwsAccount.Stage, region: AwsRegion.Ohio},
    //   // });
    //   // pipeline.addStage(stageGlobal);
    //
    //   const stageRegionalDefaults: RegionalStageProps = {
    //     appEnv: 'stage',
    //     // dataStackParameterExportOptions:
    //     //   stageGlobal.dataStackParameterExportOptions,
    //     logLevel: 'info',
    //     canaryDeploy: false,
    //     zone: Zone.Stage,
    //   };
    //   const stageOhio = new RegionalStage(this, `${id}-StageOhio`, {
    //     ...stageRegionalDefaults,
    //     env: {account: AwsAccount.Stage, region: AwsRegion.Ohio},
    //   });
    //   pipeline.addStage(stageOhio);
    //
    //   const stageEdge = new EdgeStage(this, `${id}-StageEdge`, {
    //     websiteStackParameterExportOptions:
    //     stageOhio.websiteStackParameterExportOptions,
    //     zone: Zone.Stage,
    //     robotsBehavior: 'Disallow',
    //     env: {account: AwsAccount.Stage, region: AwsRegion.Virginia},
    //   });
    //   pipeline.addStage(stageEdge);
    //
    //   ///////////////////////////////////////////////////////////////////////////
    //   // Prod
    //   ///////////////////////////////////////////////////////////////////////////
    //   // const prodGlobal = new GlobalStage(this, `${id}-ProdGlobal`, {
    //   //   replicationRegions: [],
    //   //   removalPolicy: RemovalPolicy.DESTROY,
    //   //   env: {account: AwsAccount.Prod, region: AwsRegion.Ohio},
    //   // });
    //   // pipeline.addStage(prodGlobal);
    //
    //   const prodRegionalDefaults: RegionalStageProps = {
    //     appEnv: 'prod',
    //     // dataStackParameterExportOptions:
    //     //   prodGlobal.dataStackParameterExportOptions,
    //     logLevel: 'info',
    //     canaryDeploy: false,
    //     zone: Zone.Prod,
    //   };
    //   const prodOhio = new RegionalStage(this, `${id}-ProdOhio`, {
    //     ...prodRegionalDefaults,
    //     env: {account: AwsAccount.Prod, region: AwsRegion.Ohio},
    //   });
    //   pipeline.addStage(prodOhio);
    //
    //   const edgeProd = new EdgeStage(this, `${id}-EdgeProd`, {
    //     websiteStackParameterExportOptions:
    //     prodOhio.websiteStackParameterExportOptions,
    //     zone: Zone.Prod,
    //     robotsBehavior: 'Disallow',
    //     env: {account: AwsAccount.Prod, region: AwsRegion.Virginia},
    //   });
    //   pipeline.addStage(edgeProd);
    // }
  }
}
