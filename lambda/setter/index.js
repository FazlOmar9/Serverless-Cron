// lambda/setter/index.js

import { SchedulerClient, CreateScheduleCommand, FlexibleTimeWindowMode, ActionAfterCompletion } from "@aws-sdk/client-scheduler";
import { parseISO, formatISO } from 'date-fns';

const schedulerClient = new SchedulerClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received event for setter:', JSON.stringify(event, null, 2));

  let requestBody;

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
        throw new Error('Invalid schedule_time_utc format. Please use ISO 8601, e.g., "2025-12-31T23:59:59Z" (offset also allowed)');
    }

    const formattedScheduleTimeWithZ = formatISO(scheduleDate, { format: 'extended', representation: 'complete' });
    const formattedScheduleTime = formattedScheduleTimeWithZ.slice(0, 19);

    // UPDATED: Sticking to 'oneTime-datenow' for scheduleName to respect 64-char limit
    const scheduleName = `oneTime-${Date.now()}`;
    console.log(`Creating schedule: ${scheduleName} for time: ${formattedScheduleTime}`);

    const lambdaInputPayload = {
      url: target_url,
      body: target_body,
    };

    const command = new CreateScheduleCommand({
      Name: scheduleName,
      ScheduleExpression: `at(${formattedScheduleTime})`,
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: {
        Mode: FlexibleTimeWindowMode.OFF,
      },
      Target: {
        Arn: workerLambdaArn,
        RoleArn: schedulerExecutionRoleArn,
        Input: JSON.stringify(lambdaInputPayload),
      },
      ActionAfterCompletion: ActionAfterCompletion.DELETE,
      State: "ENABLED",
      Description: `One-time webhook call to ${target_url}`,
      GroupName: schedulerGroupName,
    });

    const response = await schedulerClient.send(command);

    console.log('Schedule created successfully:', response);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule created successfully!',
        scheduleName: scheduleName,
        scheduleArn: response.ScheduleArn,
      }),
    };
  } catch (error) {
    console.error(`Error creating schedule: ${error.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error creating schedule: ${error.message}`),
    };
  }
};