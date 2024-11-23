import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { AttributeType, BillingMode, ProjectionType, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';

export class StatefulStack extends Stack {
  // Export from this stack
  public readonly scheduleGroup: CfnScheduleGroup;
  public readonly stateTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create the eventbridge schedule group that will be used for our scheduled events
    this.scheduleGroup = new CfnScheduleGroup(this, 'DemoScheduleGroup', {
      name: 'demo-schedule-group',
    });

    // Create a DynamoDB table that will be used to store the state of the state machine
    this.stateTable = new Table(this, 'ScheduleStateTable', {
      tableName: 'ScheduleStateTable',
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      contributorInsightsEnabled: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });

    this.stateTable.addGlobalSecondaryIndex({
      indexName: 'GSI-ExecutionTime',
      partitionKey: { name: 'groupName', type: AttributeType.STRING },
      sortKey: { name: 'executionTime', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
  }
}
