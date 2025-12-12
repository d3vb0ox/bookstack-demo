#!/usr/bin/env node
import {ExtendedApp} from 'truemark-cdk-lib/aws-cdk';
import {AwsAccount, AwsRegion} from './globals.mjs';
import {PlatformPipelineStack} from './pipeline-stack.mjs';

const app = new ExtendedApp({
  standardTags: {
    automationTags: {
      id: 'truemark',
      url: 'https://github.com/truemark/',
    },
  },
});

if (app.account === AwsAccount.Dev) {
  new PlatformPipelineStack(app, 'Bookstack', {
    repository: 'd3vb0ox/bookstack-demo',
    branch: 'main',
    devMode: true,
    env: {account: app.account, region: AwsRegion.Oregon},
  });
}

