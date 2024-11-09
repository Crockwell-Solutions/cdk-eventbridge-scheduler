import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CustomLambda } from '../constructs/custom-lambda';
import { Queue } from 'aws-cdk-lib/aws-sqs';

export class StatefulStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a custom EventBridge Bus that will be used for scheduling events

    // Create a DynamoDB table that will be used to store the state of the state machine
  }
}
