// lambda/setter/index.js

import { SchedulerClient, CreateScheduleCommand, FlexibleTimeWindowMode, ActionAfterCompletion } from "@aws-sdk/client-scheduler";
import { parseISO, formatISO } from 'date-fns';

const schedulerClient = new SchedulerClient({ region: process.env.AWS_REGION });

export const handler = async (event, context) => {
  console.log('Received event for setter:', JSON.stringify(event, null, 2));

  let requestBody;

  // Handle Function URL body (stringified) vs. direct invocation
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    requestBody = event;
  }

  const { target_url, target_body, schedule_time_utc } = requestBody;

  if (!target_url || !target_body || !schedule_time_utc) {
    console.error("Error: Missing 'target_url', 'target_body', or 'schedule_time_utc' in input.");
    return {
      statusCode: 400,
      body: JSON.stringify('Missing required parameters in input (target_url, target_body, schedule_time_utc)'),
    };
  }

  try {
    const scheduleDate = parseISO(schedule_time_utc);
    if (isNaN(scheduleDate.getTime())) {
        throw new Error('Invalid schedule_time_utc format. Please use ISO 8601, e.g., "2025-12-31T23:59:59Z" (offset also allowed).');
    }

    // Format for EventBridge Scheduler's at() expression (NO 'Z' at the end)
    const formattedScheduleTime = formatISO(scheduleDate, { format: 'extended', representation: 'complete' }).slice(0, 19);

    // --- FIX: Get environment variables from process.env ---
    const workerLambdaArn = process.env.WORKER_LAMBDA_ARN;
    const schedulerGroupName = process.env.SCHEDULER_GROUP_NAME || 'default'; // Provide a default if not strictly required
    const schedulerExecutionRoleArn = process.env.SCHEDULER_EXECUTION_ROLE_ARN;

    // --- Essential checks for environment variables ---
    if (!workerLambdaArn) {
      throw new Error("WORKER_LAMBDA_ARN environment variable not set. Deployment might be incomplete or misconfigured.");
    }
    if (!schedulerExecutionRoleArn) {
        throw new Error("SCHEDULER_EXECUTION_ROLE_ARN environment variable not set. Deployment might be incomplete or misconfigured.");
    }
    // (Optional) Add a check for schedulerGroupName if it's critical to be explicitly set

    // Schedule name, respecting the 64-character limit
    const scheduleName = `oneTime-${Date.now()}`;
    console.log(`Creating schedule: ${scheduleName} for time: ${formattedScheduleTime}`);

    const lambdaInputPayload = {
      url: target_url,
      body: target_body,
    };

    const command = new CreateScheduleCommand({
      Name: scheduleName,
      ScheduleExpression: `at(${formattedScheduleTime})`,
      ScheduleExpressionTimezone: "UTC", // Important: Tell scheduler to interpret the expression as UTC
      FlexibleTimeWindow: {
        Mode: FlexibleTimeWindowMode.OFF, // For precise one-time execution
      },
      Target: {
        Arn: workerLambdaArn, // This now correctly uses the env var
        RoleArn: schedulerExecutionRoleArn, // This now correctly uses the env var
        Input: JSON.stringify(lambdaInputPayload),
      },
      ActionAfterCompletion: ActionAfterCompletion.DELETE,
      State: "ENABLED",
      Description: `One-time webhook call to ${target_url}`,
      GroupName: schedulerGroupName, // This now correctly uses the env var
    });

    const response = await schedulerClient.send(command);

    console.log('Schedule created successfully:', response);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule created successfully!',
        scheduleName: response.Name, // Use response.Name for the confirmed schedule name
        scheduleArn: response.ScheduleArn,
      }),
    };
  } catch (error) {
    console.error(`Error creating schedule: ${error.message}`);
    // Log the full error for debugging in CloudWatch
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error creating schedule: ${error.message}`),
    };
  }
};