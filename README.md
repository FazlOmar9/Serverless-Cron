# Webhook Scheduler

A serverless webhook scheduling system built with AWS CDK that allows you to schedule one-time HTTP POST requests to any URL at a specific time.

## Architecture

This project deploys two Lambda functions orchestrated by AWS EventBridge Scheduler:

1. **Setter Lambda** - Receives scheduling requests via HTTP and creates one-time EventBridge schedules
2. **Worker Lambda** - Executes the actual webhook calls when the scheduled time arrives

```text
┌─────────────┐      ┌─────────────────┐      ┌─────────────────────┐      ┌──────────────┐
│   Client    │ ──▶  │  Setter Lambda  │ ──▶  │ EventBridge Scheduler│ ──▶  │ Worker Lambda│ ──▶ Target URL
│  (HTTP POST)│      │  (Function URL) │      │   (One-time schedule)│      │  (Webhook)   │
└─────────────┘      └─────────────────┘      └─────────────────────┘      └──────────────┘
```

## Prerequisites

* [Node.js](https://nodejs.org/) (v18 or later recommended)
* [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials
* [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) installed globally (`npm install -g aws-cdk`)

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd scheduler

# Install dependencies
npm install

# Install Lambda dependencies
cd lambda/setter && npm install && cd ../..
cd lambda/worker && npm install && cd ../..
```

## Deployment

```bash
# Build the TypeScript
npm run build

# Bootstrap CDK (first time only)
npx cdk bootstrap

# Deploy the stack
npx cdk deploy
```

After deployment, you'll see outputs including the `SetterFunctionUrl` - this is your endpoint for scheduling webhooks.

## Usage

### Scheduling a Webhook

Send a POST request to the Setter Lambda Function URL with the following JSON body:

```json
{
  "target_url": "https://your-webhook-endpoint.com/api/callback",
  "target_body": {
    "message": "Hello from scheduler!",
    "data": {
      "key": "value"
    }
  },
  "schedule_time_utc": "2025-12-31T23:59:59Z"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_url` | string | Yes | The URL to send the POST request to |
| `target_body` | object | Yes | The JSON body to send with the webhook |
| `schedule_time_utc` | string | Yes | ISO 8601 formatted UTC timestamp for when to execute |

#### Example with cURL

```bash
curl -X POST "https://your-function-url.lambda-url.region.on.aws/" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://httpbin.org/post",
    "target_body": {"message": "Scheduled webhook test"},
    "schedule_time_utc": "2025-01-15T14:30:00Z"
  }'
```

#### Successful Response

```json
{
  "message": "Schedule created successfully!",
  "scheduleName": "oneTime-1234567890123",
  "scheduleArn": "arn:aws:scheduler:region:account:schedule/default/oneTime-1234567890123"
}
```

## Customizing the Worker Lambda

The Worker Lambda ( `lambda/worker/index.js` ) is responsible for making the actual HTTP requests. You can customize it to fit your needs:

### Adding Custom Headers

```javascript
// lambda/worker/index.js
const headers = {
    'Content-Type': 'application/json',
    'X-Scheduler-Invocation': 'true',
    'Authorization': 'Bearer your-token', // Add authentication
    'X-Custom-Header': 'custom-value', // Add custom headers
};
```

### Adding Retry Logic

```javascript
// lambda/worker/index.js
const MAX_RETRIES = 3;

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            if (i === retries - 1) throw new Error(`Failed after ${retries} attempts`);
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // Exponential backoff
        }
    }
}
```

### Supporting Different HTTP Methods

```javascript
// lambda/worker/index.js
export const handler = async (event) => {
    const {
        url,
        body,
        method = 'POST'
    } = event; // Add method support

    const response = await fetch(url, {
        method: method,
        headers: headers,
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    // ...
};
```

### Adding Response Logging to External Service

```javascript
// lambda/worker/index.js
async function logToExternalService(scheduleName, response) {
    await fetch('https://your-logging-service.com/logs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            scheduleName,
            status: response.status,
            timestamp: new Date().toISOString(),
        }),
    });
}
```

### Adding Dependencies to Worker

If you need additional npm packages in the worker:

```bash
cd lambda/worker
npm install axios  # or any other package
```

Then update `lambda/worker/index.js` :

```javascript
import axios from 'axios';

export const handler = async (event) => {
    const {
        url,
        body
    } = event;
    const response = await axios.post(url, body);
    // ...
};
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch for changes and compile |
| `npm run test` | Run Jest unit tests |
| `npx cdk deploy` | Deploy stack to AWS |
| `npx cdk diff` | Compare deployed stack with current state |
| `npx cdk synth` | Emit synthesized CloudFormation template |
| `npx cdk destroy` | Remove the stack from AWS |

## Stack Outputs

After deployment, the following outputs are available:

* **WorkerLambdaArn** - ARN of the Worker Lambda function
* **SetterFunctionUrl** - HTTP endpoint for scheduling webhooks

## Notes

* Schedules are automatically deleted after execution (`ActionAfterCompletion: DELETE`)
* The Setter Lambda Function URL has **no authentication** - consider adding authentication for production use
* All times should be provided in UTC using ISO 8601 format
* The Worker Lambda has a 30-second timeout by default - adjust in `lib/scheduler-stack.ts` if needed

## License

ISC
