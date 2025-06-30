import {
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_iam as iam,
  Duration,
  CfnOutput,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class SchedulerStack extends Stack { // Renamed stack to SchedulerStack
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- 1. Worker Lambda Function ---
    // This Lambda will actually execute the webhook call
    const workerLambda = new lambda.Function(this, 'WebhookWorker', {
      runtime: lambda.Runtime.NODEJS_20_X, // Set to Node.js 20.x
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/worker')), // Code from lambda/worker directory
      timeout: Duration.seconds(30), // Adjust as needed
      memorySize: 128,
    });

    // --- 2. IAM Role for EventBridge Scheduler to invoke the Worker Lambda ---
    // This role is passed to the Setter Lambda, which uses it when creating the schedule.
    const schedulerExecutionRole = new iam.Role(this, 'SchedulerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      inlinePolicies: {
        InvokeLambda: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: [workerLambda.functionArn],
            }),
          ],
        }),
      },
    });

    // --- 3. Setter Lambda Function ---
    // This Lambda will create the one-time EventBridge Scheduler rule.
    const setterLambda = new lambda.Function(this, 'SchedulerSetter', {
      runtime: lambda.Runtime.NODEJS_20_X, // Set to Node.js 20.x
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/setter')), // Code from lambda/setter directory
      timeout: Duration.seconds(60), // Give it enough time to make SDK calls
      memorySize: 128,
      environment: {
        WORKER_LAMBDA_ARN: workerLambda.functionArn,
        SCHEDULER_GROUP_NAME: 'default', // Or create a custom schedule group if needed
        SCHEDULER_EXECUTION_ROLE_ARN: schedulerExecutionRole.roleArn, // Pass the role ARN
      },
    });

    // Add the Function URL to the Setter Lambda with no authentication
    const setterFunctionUrl = setterLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'], // Allow all origins for simplicity; adjust as needed
        allowedMethods: [lambda.HttpMethod.POST], // Only allow POST requests
        allowedHeaders: ['Content-Type'], // Allow Content-Type header
      }
    });

    // Grant Setter Lambda permissions to create schedules and pass the role
    setterLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule', 'iam:PassRole'],
        resources: [
          `arn:${this.partition}:scheduler:${this.region}:${this.account}:schedule/*`, // Allow creating schedules in any group
          schedulerExecutionRole.roleArn, // Important: allow passing this specific role
        ],
      })
    );

    // --- Outputs (for easy reference after deployment) ---
    new CfnOutput(this, 'WorkerLambdaArn', {
      value: workerLambda.functionArn,
      description: 'ARN of the Worker Lambda function',
    });

    new CfnOutput(this, 'SetterLambdaArn', {
      value: setterLambda.functionArn,
      description: 'ARN of the Setter Lambda function',
    });

    new CfnOutput(this, 'SchedulerExecutionRoleArn', {
      value: schedulerExecutionRole.roleArn,
      description: 'ARN of the role EventBridge Scheduler uses to invoke the Worker Lambda',
    });

    new CfnOutput(this, 'SetterFunctionUrl', {
      value: setterFunctionUrl.url,
      description: 'The HTTP Invoke URL for the Setter Lambda function (AWS_IAM authenticated)',
    });
  }
}