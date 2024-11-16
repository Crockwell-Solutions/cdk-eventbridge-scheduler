import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CustomLambda } from '../constructs/custom-lambda';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Trail } from 'aws-cdk-lib/aws-cloudtrail';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';

export interface StatelessStackProps extends StackProps {
  readonly scheduleGroup: CfnScheduleGroup;
  readonly stateTable: Table;
}

export class StatelessStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessStackProps) {
    super(scope, id, props);

    // Create a queue that will be used to receive messages from the Lambda function
    const targetQueue = new Queue(this, 'EventBridgeTargetQueue', {
      queueName: 'EventBridgeTargetQueue',
    });

    // Create a role that will be used by EventBridge Scheduler to send messages to the queue
    const eventBridgeRole = new Role(this, 'EventBridgeRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });
    targetQueue.grantSendMessages(eventBridgeRole);

    // Create a Lambda function that will create future scheduled events in EventBridge
    const seedSchedulesFunction = new CustomLambda(this, 'SeedSchedulesFunction', {
      path: 'src/seed-scheduled-function.ts',
      environmentVariables: {
        EVENTBRIDGE_GROUP_NAME: props.scheduleGroup.name,
        EVENTBRIDGE_ROLE_ARN: eventBridgeRole.roleArn,
        TARGET_QUEUE_ARN: targetQueue.queueArn,
        TIMEZONE: 'Europe/London',
      },
    }).lambda;
  
    // Grant the Lambda function permissions to create scheduled events in EventBridge
    seedSchedulesFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule', 'scheduler:UpdateSchedule'],
      resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/${props.scheduleGroup.name}/*`],
    }));
  
    // Grant the Lambda function permissions to pass the EventBridge role to the EventBridge service
    seedSchedulesFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${this.account}:role/*`],
      conditions: {
        StringLike: {
          'iam:PassedToService': 'scheduler.amazonaws.com',
        },
      },
    }));

    // Create a Lambda function that will be called by EventBridge when any schedules change
    const scheduleMonitorFunction = new CustomLambda(this, 'ScheduleMonitorFunction', {
      path: 'src/schedule-monitor-function.ts',
      environmentVariables: {
        TABLE_NAME: props.stateTable.tableName,
      }
    }).lambda;
    props.stateTable.grantReadWriteData(scheduleMonitorFunction);

    // Create the eventbridge rule that will  trigger the scheduleMonitorFunction
    const scheduledEventRule = Trail.onEvent(this, 'ScheduledEventRule', {
      target: new LambdaFunction(scheduleMonitorFunction),
    });
    scheduledEventRule.addEventPattern({
      account: [this.account],
      source: ['aws.scheduler'],
      detail: {
        eventName: ['CreateSchedule', 'UpdateSchedule', 'DeleteSchedule'],
        // Remove to open up to events from all groups
        requestParameters: {
          groupName: [props.scheduleGroup.name],
        }
      }
    });
  }
}
