/**
 * Seed EventBridge Scheduled Events Function
 * 
 * A simple function that populates the EventBridge bus with five future scheduled events.
 * The target of these events is the EventBridgeTargetQueue.
 * 
 * This function is used to demonstrate how DynamoDB will be used to store the state of the scheduled events.
 */

// Perform the necessary imports
import { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand, DeleteScheduleCommand, FlexibleTimeWindowMode } from '@aws-sdk/client-scheduler';
// Use the AWS Lambda Powertools Logger
import { Logger } from '@aws-lambda-powertools/logger';
import { randomUUID } from 'crypto';
export const logger = new Logger();

// Import the environment variables
const EVENTBRIDGE_GROUP_NAME = process.env.EVENTBRIDGE_GROUP_NAME || '';
const EVENTBRIDGE_ROLE_ARN = process.env.EVENTBRIDGE_ROLE_ARN || '';
const TARGET_QUEUE_ARN = process.env.TARGET_QUEUE_ARN || '';
const TIMEZONE = process.env.TIMEZONE || 'Europe/London';

// Setup the EventBridge scheduler client
const ebClient = new SchedulerClient();

interface ScheduledEventPayload {
  [key: string]: any;
}

interface ScheduledEventResponse {
  success: boolean;
  error?: any;
}

/**
 * Lambda Handler
 *
 * @param {object} event - The event object containing the payload passed to this function.
 * @param {object} context - The context object provided by the AWS Lambda runtime.
 */
export async function handler(event: any) {
  logger.info('Processing lambda scheduled events seed function', { event: event });

  // Create the IDs for the scheduled events as UUIDs
  const schedule1: string = randomUUID().toUpperCase();
  const schedule2: string = randomUUID().toUpperCase();
  const schedule3: string = randomUUID().toUpperCase();

  // Create the first scheduled event for one hour in the future
  await createScheduledEvent(
    schedule1,
    EVENTBRIDGE_GROUP_NAME,
    { message: 'Event 1' },
    TARGET_QUEUE_ARN,
    EVENTBRIDGE_ROLE_ARN,
    TIMEZONE,
    new Date(Date.now() + 60 * 60 * 1000).toISOString().split('.')[0],
  );

  // Create the second scheduled event for two hours in the future
  await createScheduledEvent(
    schedule2,
    EVENTBRIDGE_GROUP_NAME,
    { message: 'Event 1' },
    TARGET_QUEUE_ARN,
    EVENTBRIDGE_ROLE_ARN,
    TIMEZONE,
    new Date(Date.now() + 120 * 60 * 1000).toISOString().split('.')[0],
  );

  // Create the third scheduled event for three hours in the future
  await createScheduledEvent(
    schedule3,
    EVENTBRIDGE_GROUP_NAME,
    { message: 'Event 1' },
    TARGET_QUEUE_ARN,
    EVENTBRIDGE_ROLE_ARN,
    TIMEZONE,
    new Date(Date.now() + 180 * 60 * 1000).toISOString().split('.')[0],
  );

  // Wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Update the second scheduled event to be four hours in the future
  await updateScheduledEvent(
    schedule2,
    EVENTBRIDGE_GROUP_NAME,
    { message: 'Event 1' },
    TARGET_QUEUE_ARN,
    EVENTBRIDGE_ROLE_ARN,
    TIMEZONE,
    new Date(Date.now() + 240 * 60 * 1000).toISOString().split('.')[0],
  );

  // Delete the first scheduled event
  await deleteScheduledEvent(schedule1, EVENTBRIDGE_GROUP_NAME);

  logger.info('Scheduled events seed function completed');

  return {
    statusCode: 200,
    body: JSON.stringify('Scheduled events seed function completed'),
  };
};

/**
 * Creates a scheduled event in EventBridge.
 * Handles throttling by retrying up to a specified number of times.
 *
 * @param {string} name - The name of the scheduled event.
 * @param {string} groupName - The name of the group to which the scheduled event belongs.
 * @param {ScheduledEventPayload} payload - The payload to be sent with the scheduled event.
 * @param {string} targetArn - The ARN of the target to which the event will be sent.
 * @param {string} roleArn - The ARN of the role that EventBridge will assume to send the event.
 * @param {string} timezone - The timezone in which the schedule expression is evaluated.
 * @param {string} time- 'YYYY-MM-DDTHH:MM:SS' format string of the time that the event should be fired.
 * @param {number} [maxRetries=5] - The maximum number of retry attempts for the scheduled event.
 * @param {number} [retries=0] - The current number of retry attempts.
 * @param {string} dlqArn - [OPTIONAL] - The ARN of the dead-letter queue to which failed events will be sent.
 * @returns {Promise<ScheduledEventResponse>} A promise that resolves to the response of the scheduled event creation.
 */
async function createScheduledEvent(
  name: string,
  groupName: string,
  payload: ScheduledEventPayload,
  targetArn: string,
  roleArn: string,
  timezone: string,
  time: string,
  maxRetries: number = 5,
  retries: number = 0,
  dlqArn?: string,
): Promise<ScheduledEventResponse> {
  const params = new CreateScheduleCommand({
    Name: name,
    GroupName: groupName,
    Target: {
      RoleArn: roleArn,
      Arn: targetArn,
      ...(dlqArn && {
        DeadLetterConfig: {
          Arn: dlqArn,
        },
      }),
      RetryPolicy: {
        MaximumEventAgeInSeconds: 900,
        MaximumRetryAttempts: maxRetries,
      },
      Input: JSON.stringify(payload),
    },
    FlexibleTimeWindow: {
      Mode: FlexibleTimeWindowMode.OFF,
    },
    ScheduleExpressionTimezone: timezone,
    ActionAfterCompletion: 'DELETE',
    ScheduleExpression: `at(${time})`,
  });

  try {
    const response = await ebClient.send(params);
    logger.info('Response from EventBridge scheduler', { response: response });
    return {
      success: true,
    };
  } catch (err) {
    if ((err as any).name === 'ConflictException') {
      logger.warn('Schedule already exists, updating existing schedule', { scheduleId: name });
      return await updateScheduledEvent(name, groupName, payload, targetArn, roleArn, timezone, time, undefined, undefined, dlqArn);
    }
    if ((err as any).name === 'ThrottlingException' && retries < 3) {
      logger.warn('Eventbridge is throttling requests, backing off and retrying', { scheduleId: name });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return await createScheduledEvent(
        name,
        groupName,
        payload,
        targetArn,
        roleArn,
        timezone,
        time,
        maxRetries,
        retries + 1,
        dlqArn,
      );
    }
    logger.error('Error scheduling EventBridge scheduled event', { error: err });
    return {
      success: false,
      error: err,
    };
  }
}

/**
 * Updates an existing EventBridge scheduled event. If the event does not exist, it creates a new one.
 * Handles throttling by retrying up to a specified number of times.
 *
 * @param name - The name of the scheduled event.
 * @param groupName - The name of the group to which the scheduled event belongs.
 * @param payload - The payload to be sent with the scheduled event.
 * @param targetArn - The ARN of the target to invoke when the event is triggered.
 * @param roleArn - The ARN of the role that grants permissions to EventBridge to invoke the target.
 * @param timezone - The timezone in which the schedule expression is evaluated.
 * @param time - The time at which the event is scheduled to occur.
 * @param maxRetries - The maximum number of retry attempts for the scheduled event. Default is 5.
 * @param retries - The current number of retry attempts. Default is 0.
 * @param dlqArn - [OPTIONAL] - The ARN of the dead-letter queue to use for the scheduled event.
 * @returns A promise that resolves to a ScheduledEventResponse indicating the success or failure of the operation.
 */
async function updateScheduledEvent(
  name: string,
  groupName: string,
  payload: ScheduledEventPayload,
  targetArn: string,
  roleArn: string,
  timezone: string,
  time: string,
  maxRetries: number = 5,
  retries: number = 0,
  dlqArn?: string,
): Promise<ScheduledEventResponse> {
  const params = new UpdateScheduleCommand({
    Name: name,
    GroupName: groupName,
    Target: {
      RoleArn: roleArn,
      Arn: targetArn,
      ...(dlqArn && {
        DeadLetterConfig: {
          Arn: dlqArn,
        },
      }),
      RetryPolicy: {
        MaximumEventAgeInSeconds: 900,
        MaximumRetryAttempts: maxRetries,
      },
      Input: JSON.stringify(payload),
    },
    FlexibleTimeWindow: {
      Mode: FlexibleTimeWindowMode.OFF,
    },
    ScheduleExpressionTimezone: timezone,
    ActionAfterCompletion: 'DELETE',
    ScheduleExpression: `at(${time})`,
  });

  try {
    const response = await ebClient.send(params);
    logger.info('Response from EventBridge scheduler', { response: response });
    return {
      success: true,
    };
  } catch (err) {
    if ((err as any).name === 'ResourceNotFoundException') {
      logger.warn('Schedule does not exist, creating new schedule', { scheduleId: name });
      return await createScheduledEvent(name, groupName, payload, targetArn, roleArn, timezone, time, undefined, undefined, dlqArn);
    }
    if ((err as any).name === 'ThrottlingException' && retries < 3) {
      logger.warn('Eventbridge is throttling requests, backing off and retrying', { scheduleId: name });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return await updateScheduledEvent(
        name,
        groupName,
        payload,
        targetArn,
        roleArn,
        timezone,
        time,
        maxRetries,
        retries + 1,
        dlqArn,
      );
    }
    logger.error('Error updating the EventBridge scheduled event', { error: err });
    return {
      success: false,
      error: err,
    };
  }
}

/**
 * Deletes a scheduled event from EventBridge.
 *
 * @param {string} name - The name of the scheduled event to delete.
 * @param {string} groupName - The name of the group that the scheduled event belongs to.
 * @returns {Promise<ScheduledEventResponse>} A promise that resolves to a ScheduledEventResponse indicating the success or failure of the operation.
 *
 * @throws {Error} If there is an error deleting the scheduled event.
 */
export async function deleteScheduledEvent(name: string, groupName: string): Promise<ScheduledEventResponse> {
  const params = new DeleteScheduleCommand({
    Name: name,
    GroupName: groupName,
  });

  try {
    const response = await ebClient.send(params);
    logger.info('Response from EventBridge scheduler', { response: response });
    return {
      success: true,
    };
  } catch (err) {
    logger.error('Error deleting the EventBridge scheduled event', { error: err });
    return {
      success: false,
      error: err,
    };
  }
}