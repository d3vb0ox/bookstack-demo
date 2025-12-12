cdk-new: Minimal CDK app (shoar-style) to deploy BookStack on ECS

This directory provides a minimal AWS CDK application that follows the same pattern used in the shoar CDK (uses ExtendedApp and ExtendedStack from truemark-cdk-lib) and deploys:

- VPC (public, private, isolated)
- S3 bucket for BookStack attachments
- Aurora MySQL Serverless v2 with Secrets Manager credentials
- ECS Fargate service behind an ALB running solidnerd/bookstack

Structure
- src/cdk.mts — CDK entry using ExtendedApp, creates BookstackStack
- src/bookstack-stack.mts — S3, RDS Aurora MySQL serverless v2, ECS Fargate + ALB
- src/globals.mts — Simple region/account enum placeholders

Prerequisites
- Node.js 20+
- AWS credentials configured for your target account

Install, build, synth
1. cd cdk-new
2. pnpm i or npm i
3. npm run build
4. npm run synth

Deploy
- npm run deploy

Outputs
- LoadBalancerDNS: public ALB DNS name for BookStack
- BucketName: S3 bucket used for attachments
- DbEndpoint: Aurora cluster endpoint
- DbSecretArn: Secrets Manager secret with DB credentials

Notes
- S3 access is granted via the task role (no static keys). STORAGE_TYPE is set to s3.
- DB credentials are provided from Secrets Manager via DB_USERNAME and DB_PASSWORD.
- Default DB is bookstack; engine is Aurora MySQL 3.x serverless v2 with basic autoscaling.
- Security groups allow ECS tasks to connect to the DB on port 3306.
- This is a minimal reference; adjust sizing, TLS/ACM/DNS, and VPC endpoints as needed.
