/**
 * Seed EventBridge Scheduled Events Function
 * 
 * A simple function that populates the EventBridge bus with five future scheduled events.
 * The target of these events is the EventBridgeTargetQueue.
 * 
 * This function is used to demonstrate how DynamoDB will be used to store the state of the scheduled events.
 */

const EVENTBRIDGE_BUS = process.env.EVENTBRIDGE_BUS;

// Use the AWS Lambda Powertools Logger
import { Logger } from '@aws-lambda-powertools/logger';
export const logger = new Logger();

/**
 * Lambda Handler
 *
 * @param {object} event - The event object containing the payload passed to this function.
 * @param {object} context - The context object provided by the AWS Lambda runtime.
 */
export async function handler(event: any) {
  logger.info('Processing lambda scheduled events seed function', { event: event });

  logger.info('Scheduled events seed function completed');

  return {
    statusCode: 200,
    body: JSON.stringify('Scheduled events seed function completed'),
  };
};
