# BookStack on AWS ECS (Fargate) — Reference Deployment Pattern

This repository provides a reference pattern for deploying the BookStack application to Amazon ECS using AWS Fargate, delivered via:

- AWS CodeCommit for source control
- AWS CodePipeline + CodeBuild for CI/CD
- AWS CDK (TypeScript or Python) for infrastructure as code

It is designed to support multiple environments (e.g., `dev`, `staging`, `prod`) with clear promotion flows and environment-specific configuration.


## cdk implementation (what this repo currently deploys)

The `cdk` directory contains a ready-to-deploy AWS CDK v2 implementation that provisions:

- VPC integration via lookup (you must provide an existing VPC ID)
- Public Application Load Balancer (ALB) with optional HTTPS via ACM and Route 53 alias record
- ECS Fargate cluster and a BookStack service running the upstream image `ghcr.io/linuxserver/bookstack`
  - ARM64 tasks by default
  - Private isolated subnets for tasks
  - Target group health checks on `/`
- Data layer:
  - Aurora-compatible MySQL database (via `DatabaseConstruct`) with credentials in Secrets Manager
  - S3 bucket for attachments/storage (via `StorageConstruct`)

Where to look in code:
- `cdk/src/cdk.mts` — CDK app entrypoint
- `cdk/src/bookstack-stack.mts` — top-level stack wiring ALB, data, and ECS
- `cdk/src/constructs/ecs.mts` — ECS cluster/service configuration
- `cdk/src/constructs/load-balancer.mts` — ALB, listeners, Route 53 alias, and optional ACM certificate
- `cdk/src/data-stack.mts` — database and storage constructs

Required CDK context (set in `cdk/cdk.context.json` or pass via `-c key=value`):
- `vpcId` — existing VPC ID to deploy into
- `appUrl` — full DNS name for BookStack (e.g., `bookstack.example.com`)
- `hostedZoneId` — Route 53 hosted zone ID containing `appUrl`
- `hostedZoneName` — hosted zone name (e.g., `example.com`)

Important behavior and defaults:
- Image: `ghcr.io/linuxserver/bookstack` with tag `arm64v8-latest` (set in `bookstack-stack.mts`). You can override by changing `imageTag` or by using the SSM parameter logic below.
- Image tag resolution: if `imageTag` is not supplied, the service will attempt to read from SSM Parameter Store at `/bookstack/production/<service-name>/image-tag` and parse JSON for the `latest` key; otherwise it falls back to `latest`.
- Service discovery: disabled in `bookstack-stack.mts` (set `enableServiceDiscovery: false`).
- Networking: tasks run in private isolated subnets; ALB is internet-facing and forwards to the service on port 80.
- Permissions: the task role is granted access to the created S3 bucket used for storage.

Container configuration (as defined in `bookstack-stack.mts`):
- Port: `80`
- CPU/Memory: `1024` CPU, `2048` MiB memory
- Desired count: `1`
- Env vars set:
  - `APP_LANG=en`
  - `APP_URL=https://<appUrl>`
  - `APP_KEY` is currently hard-coded for demo purposes — you should rotate this to a Secrets Manager secret in production
  - `DB_HOST` from the Aurora cluster endpoint
  - `DB_USERNAME=bookstack`, `DB_DATABASE=bookstack`
  - `STORAGE_TYPE=s3`, `STORAGE_S3_BUCKET=<provisioned-bucket>`, `STORAGE_S3_REGION=<stack region>`
- Secrets:
  - `DB_PASSWORD` from Secrets Manager (created by the database construct)

Quick start (cdk):
1. Prereqs: Node.js 20+, AWS CLI configured, and AWS CDK v2
2. Configure context in `cdk/cdk.context.json` (copy and edit the existing example) or pass `-c` flags
   - Required keys: `vpcId`, `appUrl`, `hostedZoneId`, `hostedZoneName`
3. Install dependencies and deploy
   - `cd cdk`
   - `npm install`
   - Optionally: `npx cdk bootstrap aws://<ACCOUNT>/<REGION>` (first-time per account/region)
   - `npm run deploy` (or `npx cdk deploy`)
4. After deploy, access BookStack at `https://<appUrl>`

Notes and recommendations:
- Replace the demo `APP_KEY` with a secret in Secrets Manager and wire it in similar to `DB_PASSWORD`.
- If using the SSM parameter-based image tag flow, write a JSON payload with a `latest` field to `/bookstack/production/bookstack-service/image-tag` (or the service name you choose), for example: `{ "latest": "arm64v8-latest" }`.
- By default, the ALB creates an HTTPS listener only when both `hostedZoneName` and a matching ACM certificate can be issued for `appUrl`; otherwise HTTP is used.


## What you get
- A recommended AWS architecture for BookStack on ECS with Fargate
- Example CI/CD flow using CodeCommit → CodePipeline → CodeBuild → ECS (via CDK)
- Environment strategy and promotion workflow
- Guidance on BookStack configuration (DB, storage, auth) and secret management on ECS
- Example CDK stack decomposition and suggested repo layout


## Architecture Overview

Core components per environment:
- Amazon ECS cluster on Fargate (`ecs-dev`, `ecs-staging`, `ecs-prod`)
- ECS Service (Fargate) running BookStack Task Definition
- Application Load Balancer (ALB) + HTTPS via ACM
- Amazon RDS (MariaDB or Aurora MySQL) for BookStack database
- Amazon S3 for attachments and images (optional, recommended)
- AWS Secrets Manager for DB credentials, app key, SMTP and S3 secrets
- Amazon ECR for the BookStack container image (or use upstream image)
- Amazon Route 53 for DNS
- Amazon CloudWatch Logs for task logs

Networking:
- VPC with public subnets (ALB) and private subnets (Fargate tasks, RDS)
- Security groups to restrict traffic: ALB → ECS tasks (HTTPS/HTTP), ECS tasks → RDS (3306), tasks → S3 via VPC endpoints (optional)

Scaling:
- ECS Service auto scaling on CPU/Memory or ALB RequestCount


## High-Level Flow Diagram (Change Propagation)

```mermaid
flowchart LR
  A[Developer Commit to CodeCommit (dev branch)] --> B[CodePipeline - Dev]
  B --> C[CodeBuild: Build Docker & Push to ECR]
  C --> D[CDK Deploy: Update ECS Task/Service]
  D --> E[Automated/Manual Tests]
  E -->|Manual approval| F[Merge/Tag for Staging]
  F --> G[CodePipeline - Staging]
  G --> H[Build/Deploy to ECS Staging]
  H --> I[Integration/Perf Tests]
  I -->|Manual approval| J[Merge/Tag for Prod]
  J --> K[CodePipeline - Prod]
  K --> L[Build/Deploy to ECS Prod]
```


## Repository Layout (suggested)

```
bookstack-demo/
├─ cdk/                           # CDK app(s)
│  ├─ bin/                        # entrypoints per env (e.g., dev.ts, prod.ts)
│  ├─ lib/                        # stacks: vpc, ecs, rds, alb/dns, pipelines
│  └─ cdk.json
├─ app/                           # (optional) app-level config/templates
├─ docker/                        # Docker context if building a custom image
│  └─ Dockerfile                  # e.g., FROM linuxserver/bookstack
├─ env/                           # per-environment config (YAML/JSON)
│  ├─ dev/config.yaml
│  ├─ staging/config.yaml
│  └─ prod/config.yaml
├─ pipelines/                     # CodeBuild specs, pipeline definitions
│  ├─ buildspec-image.yaml        # build & push image to ECR
│  ├─ buildspec-deploy.yaml       # cdk synth & deploy (update ECS service)
│  └─ cdk-pipeline.ts             # or .py (if using CDK Pipelines)
└─ README.md
```


## CDK Stacks (suggested decomposition)

- `NetworkStack` (optional if using existing VPC)
- `EcsStack` (ECS cluster, Fargate service/task, ALB, listeners, target groups)
- `RdsStack` (Aurora MySQL or MariaDB with secrets)
- `DnsStack` (Route 53 hosted zone and records, ACM certs)
- `BookstackPipelineStack` (CodeCommit repo, CodePipeline, CodeBuild projects, IAM roles, ECR)

Dependencies: `EcsStack` references Secrets Manager values from `RdsStack` and uses ACM certs/Route 53 records from `DnsStack`. `BookstackPipelineStack` builds/pushes the image to ECR and triggers `cdk deploy` to roll the ECS service.


## BookStack Deployment Model on ECS

You can run BookStack using the official `linuxserver/bookstack` image or a custom derivative. The ECS Task Definition wires configuration using environment variables and secrets from Secrets Manager.

Key runtime configuration (env vars and secrets):
- `APP_URL` → environment-specific DNS
- `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_CONNECTION` (mysql/mariadb)
- `APP_KEY` (generate and store securely in Secrets Manager)
- `FILESYSTEM_DRIVER` (`local` or `s3`), plus `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET` if using S3
- SMTP: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`

Load balancing & TLS:
- ALB with HTTPS listener (443) using ACM certificate; target group health checks on `HTTP /` or `/health` if you add one.


## CI/CD Pattern

Source: AWS CodeCommit repository.

Pipelines: One pipeline per environment or a single multi-stage pipeline with approvals. Example flow:

1. Developer pushes to `dev` branch
2. CodePipeline (Dev) triggers
   - CodeBuild Image stage: Build Docker image and push to ECR
   - CodeBuild Deploy stage: `cdk synth && cdk deploy` to update ECS Task Definition/Service with new image tag
3. On approval/merge/tag, the Staging pipeline runs and deploys similarly
4. After tests and approval, Prod pipeline deploys

Example buildspecs (snippets):

Image build and push (`pipelines/buildspec-image.yaml`):

```yaml
version: 0.2
env:
  variables:
    IMAGE_REPO_NAME: bookstack
phases:
  pre_build:
    commands:
      - aws --version
      - ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
      - IMAGE_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME
      - GIT_SHA=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-7)
  build:
    commands:
      - docker build -t $IMAGE_URI:$GIT_SHA -t $IMAGE_URI:latest ./docker
  post_build:
    commands:
      - docker push $IMAGE_URI:$GIT_SHA
      - docker push $IMAGE_URI:latest
      - printf '{"imageUri":"%s"}' "$IMAGE_URI:$GIT_SHA" > imageDetail.json
artifacts:
  files:
    - imageDetail.json
```

CDK deploy (`pipelines/buildspec-deploy.yaml`):

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 18
    commands:
      - npm i -g aws-cdk
  build:
    commands:
      - export IMAGE_URI=$(cat imageDetail.json | jq -r '.imageUri')
      - cdk synth
      - cdk deploy --require-approval never
artifacts:
  files: []
```

Notes:
- The CDK stack should read the image tag/URI (e.g., from `IMAGE_URI` env or SSM Parameter) and update the ECS Task Definition accordingly.
- Consider AWS CodeDeploy Blue/Green for ECS for zero-downtime and safer rollouts.


## Environment Configuration

Each environment directory (e.g., `env/dev/config.yaml`) may define:
- `domain`: `bookstack.dev.example.com`
- `imageRepo`: ECR repo name and tag strategy
- `cpu`, `memory`, `desiredCount`, scaling targets
- `rds` connection secrets reference (Secrets Manager ARN)
- `s3` bucket name and IAM policy attachments
- `alb` listener rules and health check path

Secrets management approaches:
- Store DB credentials, `APP_KEY`, SMTP and S3 credentials in Secrets Manager. Reference them in the ECS Task Definition `secret` fields.
- Use separate secrets per environment to avoid cross-env leakage.


## DNS & TLS

- Use Route 53 for DNS records like `bookstack.dev.example.com`, `bookstack.staging.example.com`, `bookstack.example.com`.
- Use ACM certificates for the domain/hosts. Attach to ALB HTTPS listener.
- Redirect HTTP (80) to HTTPS (443).


## Promotion Workflow Diagram (Environments)

```mermaid
sequenceDiagram
  participant Dev as Dev Branch
  participant CPD as CodePipeline Dev
  participant ECSd as ECS Dev (Fargate)
  participant CPS as CodePipeline Staging
  participant ECSs as ECS Staging (Fargate)
  participant CPP as CodePipeline Prod
  participant ECSp as ECS Prod (Fargate)

  Dev->>CPD: Push change
  CPD->>ECSd: Build image → CDK deploy
  ECSd-->>CPD: Health checks pass
  CPD-->>Dev: Notify success
  Note right of Dev: PR/Merge or Tag for Staging
  Dev->>CPS: Tag/merge triggers
  CPS->>ECSs: Build image → CDK deploy
  ECSs-->>CPS: Integration tests pass
  CPS-->>CPP: Manual approval gate
  CPP->>ECSp: Build image → CDK deploy
  ECSp-->>CPP: Health checks pass
```


## Getting Started (Step-by-step)

1. Bootstrap CDK in your AWS account/regions
   - `cdk bootstrap aws://ACCOUNT/REGION`
2. Deploy core infrastructure with CDK
   - VPC (if needed), RDS, ECS cluster, ALB, DNS/ACM, ECR
3. Create CodeCommit repo and push this project
4. Deploy the `BookstackPipelineStack` (CDK) to set up ECR + pipelines + CodeBuild projects
5. Configure environment files: `env/dev|staging|prod/config.yaml`
6. Store secrets in Secrets Manager (DB credentials, `APP_KEY`, SMTP, S3 keys)
7. Let the Dev pipeline run; verify BookStack at `https://bookstack.dev.example.com`
8. Promote to Staging/Prod via merge/tag and approvals


## BookStack Configuration Notes

Refer to the official docs: https://www.bookstackapp.com/docs/admin/installation/

Common env variables (set via ECS task definition env/secret):
- `APP_URL`
- `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`
- `DB_CONNECTION` (mysql or mariadb)
- `APP_KEY` (application key; generate and store securely)
- `FILESYSTEM_DRIVER` (local or s3) and S3 credentials if applicable
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`


## Security & Compliance

- Use distinct IAM roles: Task Execution Role (pull image, write logs) and Task Role (S3 and Secrets access with least privilege)
- Restrict security groups: ALB inbound 443 from internet; ALB → tasks on listener port; tasks → RDS 3306; no inbound to RDS from internet
- Enforce TLS in transit: ALB HTTPS; optionally RDS require SSL
- Rotate secrets via Secrets Manager and reference them directly in the task definition
- Consider AWS WAF on the ALB
- Configure CloudWatch Log retention and enable access logging on ALB (to S3)


## Cost Considerations

- Fargate charges per vCPU and GB-hour for running tasks
- ALB per hour and LCU usage
- RDS instance hours and storage (consider Multi-AZ for prod)
- S3 storage for attachments if enabled
- Data transfer costs


## Cleanup

Delete stacks in reverse dependency order (Prod → Staging → Dev):
1. Scale down or delete ECS Services/Tasks (CDK destroy for app stack)
2. Destroy pipeline stack (CodePipeline/CodeBuild/ECR if desired)
3. Destroy DNS/ACM, RDS, ECS cluster, and VPC stacks as applicable


## Roadmap / Extensions

- Add Blue/Green deployments with AWS CodeDeploy for ECS
- Add automated smoke/integration tests in CodeBuild after deploy
- Add sessions cache (e.g., ElastiCache/Redis) if needed for scale
- Add SSO integration (ALB OIDC auth or in-app SSO)
- Add cross-region DR (RDS snapshots, S3 replication)


## License

This repository is provided as a reference pattern. Adapt and use according to your organization’s policies and licensing requirements.
