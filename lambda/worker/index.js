// lambda/worker/index.js
// This Lambda will actually execute the webhook call using ES Modules syntax.

// Node.js 20.x has the global fetch API.

export const handler = async (event) => {
  console.log('Received event for worker:', JSON.stringify(event, null, 2));

  const { url, body } = event;

  if (!url || !body) {
    console.error("Error: 'url' or 'body' missing in event payload.");
    return {
      statusCode: 400,
      body: JSON.stringify('Missing URL or body in payload'),
    };
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Scheduler-Invocation': 'true', // Custom header for tracking
    };

    console.log(`Making POST request to ${url} with body: ${JSON.stringify(body)}`);

    // Using Node.js native fetch API
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook call failed with status ${response.status} and body: ${errorText}`);
    }

    const responseData = await response.text(); // Or .json() if expecting JSON
    console.log(`Webhook call successful! Status: ${response.status}, Response: ${responseData}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Webhook called successfully',
        statusCode: response.status,
        responseBody: responseData,
      }),
    };
  } catch (error) {
    console.error(`Error calling webhook: ${error.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error calling webhook: ${error.message}`),
    };
  }
};