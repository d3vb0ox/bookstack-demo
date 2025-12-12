import {Construct} from "constructs";
import {ExtendedStack, ExtendedStackProps} from "truemark-cdk-lib/aws-cdk";
import {RemovalPolicy} from "aws-cdk-lib";
import {Env, LogLevel, Zone} from './globals.mjs';
import {Bucket} from "aws-cdk-lib/aws-s3";

export interface BookstackProps extends ExtendedStackProps {
  readonly removalPolicy?: RemovalPolicy;
  readonly appEnv: Env;
  readonly logLevel: LogLevel;
  readonly zone: Zone;
}

 export class BookStack extends ExtendedStack {
   constructor(scope: Construct, id: string, props?: BookstackProps) {
     super(scope, id, props);

     const assetsBucket = new Bucket(this, 'AssetsBucket', {
       removalPolicy: props?.removalPolicy ?? RemovalPolicy.DESTROY,
       autoDeleteObjects: true,
       publicReadAccess: false,
       blockPublicAccess: {
         blockPublicAcls: false,
         blockPublicPolicy: true,
         ignorePublicAcls: false,
         restrictPublicBuckets: true,
       }
     })
   }
 }
