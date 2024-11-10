#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StatelessStack } from '../lib/stateless/stateless-stack';
import { StatefulStack } from '../lib/stateless/stateful-stack';

const app = new cdk.App();
const statefulStack = new StatefulStack(app, 'StatefulStack', {});
new StatelessStack(app, 'StatelessStack', {
  scheduleGroup: statefulStack.scheduleGroup,
  stateTable: statefulStack.stateTable,
});
