/**
 * Schedule Monitor Function
 * 
 * A simple function that is invoked whenever an EventBridge Scheduled Event is created, updated, or deleted.
 * The state of that scheduled event is then stored in a DynamoDB table.
 * 
 * An example event include the following within the `detail` object:
 *
  "requestParameters": {
    "name": "F143F8DF-0547-4176-BAE9-C2695D99B925",
    "groupName": "demo-schedule-group",
    "scheduleExpression": "at(2024-11-16T21:08:31)",
    "scheduleExpressionTimezone": "Europe/London",
    "flexibleTimeWindow": {
      "mode": "OFF"
    },
    "clientToken": "a3fe7a1c-3a0d-454c-85ad-638821b5dec7",
    "actionAfterCompletion": "DELETE"
  }
 */

// Use the AWS Lambda Powertools Logger
import { Logger } from '@aws-lambda-powertools/logger';
export const logger = new Logger();
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.TABLE_NAME || '';

// Setup the DynamoDB Document client
const marshallOptions = {
  convertEmptyValues: false, // Whether to automatically convert empty strings, blobs, and sets to `null`.
  removeUndefinedValues: true, // Whether to remove undefined values while marshalling.
  convertClassInstanceToMap: true, // Whether to convert typeof object to map attribute.
};
const unmarshallOptions = {
  wrapNumbers: false, // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
};
const translateConfig = { marshallOptions, unmarshallOptions };
const client = new DynamoDBClient();
const ddbDocClient = DynamoDBDocument.from(client, translateConfig);

/**
 * Lambda Handler
 *
 * @param {object} event - The event object containing the payload passed to this function.
 * @param {object} context - The context object provided by the AWS Lambda runtime.
 */
export async function handler(event: any) {
  logger.info('Processing lambda schedule monitor function', { event: event });

  // Create or update the scheduled event record in the DynamoDB table
  const record = event.detail;
  const item = {
    PK: `${record.requestParameters?.groupName}#${record.requestParameters?.name}`,
    groupName: `${record.requestParameters?.groupName}`,
    executionTime: `${record.requestParameters?.scheduleExpression}`,
  };
  await writeItem(TABLE_NAME, item);

  return {
    statusCode: 200,
    body: JSON.stringify('Scheduled events monitor function completed'),
  };
};


/**
 * Writes a single record to a DynamoDB table.
 * This will overwrite any existing DynamoDb record with the same primary key.
 *
 * @param {Object} tableName - The dynamodb table to be written to.
 * @param {Object} item - The change record to write to DynamoDB.
 * @param {boolean} onlyIfNotExists - optional will only write if the record does NOT already exist
 * @param {boolean} onlyIfExists - optional will only write if the record already exists
 * @returns {Promise<boolean>} A Promise that resolves when the record is written, true if successful, false otherwise.
 */
export async function writeItem(
  tableName: string,
  item: any,
  onlyIfNotExists: boolean = false,
  onlyIfExists: boolean = false,
) {
  const params = {
    TableName: tableName,
    Item: item,
    ...(onlyIfNotExists && { ConditionExpression: 'attribute_not_exists(PK)' }),
    ...(onlyIfExists && { ConditionExpression: 'attribute_exists(PK)' }),
  };

  try {
    const response = await ddbDocClient.send(new PutCommand(params));
    logger.debug('Successfully wrote item to DynamoDB', { response: response });
    if (response.$metadata.httpStatusCode === 200) {
      return true;
    } else {
      logger.error(`Error writing to the ${tableName} table`, { response: response });
      return false;
    }
  } catch (err) {
    logger.error(`Error writing to the ${tableName} table`, { error: err });
    return false;
  }
}