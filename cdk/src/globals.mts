// CodeConnection ARN to source repository (GitHub)
export enum Connection {
  DevGitHub = 'arn:aws:codeconnections:us-west-2:659932761532:connection/8700961e-922b-4b48-ade7-64a4f25f94f5',
}

// Supported AWS regions used by the pipeline/stages
export enum AwsRegion {
  Virginia = 'us-east-1',
  Ohio = 'us-east-2',
  Oregon = 'us-west-2',
}

// Known VPC IDs for lookups (per environment/region)
export enum Vpc {
  DevOregon = 'vpc-06f99c19165a865f5',
}

// Application endpoint hostnames per environment
export enum AppUrl {
  DevOregon = 'bookstack.pjain.dev.truemark.io',
}

export const AwsRegionNameMap: Record<string, string> = {
  'us-west-2': 'Oregon',
  'us-east-2': 'Ohio',
  'us-east-1': 'Virginia',
};

// AWS account IDs per environment
export enum AwsAccount {
  Dev = '659932761532',
}

// export enum SlackChannel {
//   Automation = 'arn:aws:chatbot::617383789573:chat-configuration/slack-channel/automation',
// }

export enum Route53Zone {
  Dev = 'pjain.dev.truemark.io',
}

// Route53 hosted zone IDs (to avoid context lookups in CI)
export enum Route53ZoneId {
  Dev = 'Z07713053FY75DFAZXR40',
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type Env = 'dev' | 'stage' | 'prod';

// Route53 zones used by each environment
export enum Zone {
  Dev = 'pjain.dev.truemark.io',
}
