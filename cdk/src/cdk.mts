#!/usr/bin/env node
import {ExtendedApp} from 'truemark-cdk-lib/aws-cdk';
import {AwsAccount, AwsRegion} from './globals.mjs';
import {PlatformPipelineStack} from './pipeline-stack.mjs';

// Entry point for the CDK application
const app = new ExtendedApp({
  standardTags: {
    automationTags: {
      id: 'truemark',
      url: 'https://github.com/truemark/',
    },
  },
});

// Deploy the pipeline to the Dev account
if (app.account === AwsAccount.Dev) {
  new PlatformPipelineStack(app, 'Bookstack', {
    repository: 'd3vb0ox/bookstack-demo',
    branch: 'main',
    devMode: true,
    env: {account: app.account, region: AwsRegion.Oregon},
  });
}

