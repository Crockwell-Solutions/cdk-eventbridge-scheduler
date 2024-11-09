import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CustomLambda } from '../constructs/custom-lambda';
import { Queue } from 'aws-cdk-lib/aws-sqs';

export class StatelessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a queue that will be used to receive messages from the Lambda function
    const targetQueue = new Queue(this, 'EventBridgeTargetQueue', {
      queueName: 'EventBridgeTargetQueue',
    });

    // Create a Lambda function that will create future scheduled events in EventBridge
    const seedSchedulesFunction = new CustomLambda(this, 'SeedSchedulesFunction', {
      path: 'src/seed-scheduled-function.ts',
      environmentVariables: {
        EVENTBRIDGE_BUS: ,
        TARGET_QUEUE: targetQueue.queueUrl,
      },
    }).lambda;
  }
}
