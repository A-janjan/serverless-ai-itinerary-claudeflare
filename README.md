# AI Itinerary Generator - Full Stack Application

This project consists of two parts:
1. **ai-itinerary-worker** – A Cloudflare Worker that generates travel itineraries using Google's Gemini API and stores results in Firestore.
2. **itinerary-status** – A Svelte 5 frontend that allows users to check the status of their itinerary by job ID.

The system features an asynchronous workflow where the API responds immediately with a tracking ID, while itinerary generation happens in the background, ensuring a fast and responsive user experience even for complex, time-consuming AI tasks.

See the [Svelte 5 Frontend section](#svelte-5-frontend-for-status-tracking) for details on the frontend implementation.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Setup and Running Instructions](#setup-and-running-instructions)
- [Environment Variables Configuration](#environment-variables-configuration)
- [Deployment](#deployment)
- [API Usage Examples](#api-usage-examples)
- [Architectural Choices](#architectural-choices)
- [Prompt Design](#prompt-design)
- [Error Handling](#error-handling)
- [Summary and Design Rationale](#summary-and-design-rationale)
- [Development and Testing](#development-and-testing)
- [Svelte 5 Frontend for Status Tracking](#svelte-5-frontend-for-status-tracking)

---

## Architecture Overview

The system is built on several key components that work together to provide a robust, scalable travel itinerary generation service:

1. **Cloudflare Worker**: Receives requests, manages job creation, calls the Gemini API, and updates Firestore
2. **Firestore Database**: Persists job records with fields for status (`processing`, `completed`, `failed`), error messages, timestamps, and itinerary data
3. **Google Gemini LLM**: Generates structured JSON itineraries based on carefully crafted prompt instructions
4. **Zod Validation**: Ensures all LLM responses match the required schema before saving. Invalid responses trigger a `failed` status
5. **Asynchronous Processing**: The Worker immediately returns a job ID, while itinerary generation and Firestore updates happen asynchronously
6. **Error Handling**: Includes retries with exponential backoff for LLM failures, with ultimate failure recording and descriptive error messages
7. **Svelte 5 Frontend**: Provides a user-friendly interface for status tracking and itinerary viewing

---

## Prerequisites

Before getting started, ensure you have the following tools and services:

- **Node.js and npm**: Required for managing project dependencies and running the wrangler CLI
- **Cloudflare account**: With wrangler CLI installed for developing, testing, and deploying Workers
- **Google Cloud account**: With a Firebase project and Firestore database configured
- **Firebase service account key**: Downloaded as a JSON file for secure database authentication
- **Google Gemini API key**: For accessing the LLM's text generation capabilities

---

## Setup and Running Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd <your-repo-folder>
npm install
```

### 2. Cloudflare Setup

Log in to your Cloudflare account via the CLI:

```bash
wrangler login
```

This command opens a browser window for secure authentication, linking your local wrangler instance to your Cloudflare account.

### 3. Environment Variables Configuration

All sensitive keys and configurations must be stored as encrypted environment variables (secrets) on the Cloudflare platform for security and best practices.

#### Firebase Configuration

The Firebase service account key is a complex JSON object that must be stored as a single encrypted string:

1. Copy the entire content of your downloaded service account JSON file
2. Run the following command and paste the JSON content when prompted:

```bash
wrangler secret put FIREBASE_CONFIG
```

This encrypts and stores the JSON in Cloudflare's secure secrets store, accessible at runtime via `env.FIREBASE_CONFIG`.

**Alternative Method (using individual fields):**

If you prefer to store Firebase credentials separately, use these commands:

```bash
wrangler secret put FIRESTORE_PROJECT_ID
wrangler secret put FIRESTORE_CLIENT_EMAIL  
wrangler secret put FIRESTORE_PRIVATE_KEY
```

> **Important:** When setting `FIRESTORE_PRIVATE_KEY`, escape newlines as `\\n`.

#### LLM API Key

Store your Google Gemini API key securely:

```bash
wrangler secret put GEMINI_API_KEY
```

This makes your key available to the worker as `env.GEMINI_API_KEY`.

### 4. Configure wrangler.toml (Alternative)

Alternatively, you can configure non-sensitive variables in your `wrangler.toml` file:

```toml
name = "ai-itinerary-worker"
main = "src/index.js"

[env.production.vars]
FIRESTORE_PROJECT_ID = "your-project-id"
```

---

## Deployment

Deploy the application to Cloudflare's global network:

```bash
wrangler deploy
```

The wrangler CLI will:
- Bundle your code and dependencies
- Upload to Cloudflare
- Provision a new serverless endpoint

The output provides a public URL (typically `https://ai-itinerary-worker.<your-subdomain>.workers.dev`) that serves as your API endpoint.

---

## API Usage Examples

The API exposes the following endpoints:

- `POST /api` — Begins itinerary generation for a specified destination and duration
- `GET /` — Serves static assets if configured (e.g., a frontend)

### cURL Example

```bash
curl -X POST "https://<your-worker-subdomain>.workers.dev/api" \
  -H "Content-Type: application/json" \
  -d '{"destination": "Paris, France", "durationDays": 3}'
```

**Expected Response:**

```json
{
  "jobId": "generatedJobId123"
}
```

**Response Status:** `202 Accepted`

### JavaScript Fetch Example

```javascript
async function startItineraryGeneration(destination, durationDays) {
  const response = await fetch("https://<your-worker-subdomain>.workers.dev/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destination,
      durationDays
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }

  const data = await response.json();
  return data.jobId;
}

// Usage
startItineraryGeneration("Tokyo, Japan", 5)
  .then(jobId => {
    console.log("Job started with ID:", jobId);
    // Use jobId to query Firestore for status and results
  })
  .catch(console.error);
```

### Monitoring Job Status

After receiving a `jobId`, query your Firestore database to monitor the job status. The document will update from `"processing"` to `"completed"` or `"failed"` as the background processing completes.

---

## Architectural Choices

### Asynchronous Design

The central architectural decision is the asynchronous nature of the system, enabled by Cloudflare's `ctx.waitUntil()` method. This approach:

- **Prevents blocking**: Clients receive immediate responses without waiting for AI processing
- **Avoids timeouts**: Long-running LLM tasks don't cause API timeouts
- **Improves scalability**: Multiple requests can be processed concurrently
- **Enhances user experience**: Users get instant feedback with a tracking ID

### Cloudflare Workers for Serverless API

Cloudflare Workers were chosen for several compelling reasons:

- **Global edge network**: Minimizes latency for users worldwide
- **Low cold start times**: Ensures consistently fast API responses
- **Integrated tooling**: Wrangler CLI simplifies development and deployment
- **Secure secret management**: Built-in encrypted environment variable storage
- **Cost-effective scaling**: Automatic scaling with pay-per-request pricing

### Firestore for Persistence

Google Cloud Firestore is ideal for this application because:

- **Serverless architecture**: Aligns with the overall serverless approach
- **Document-oriented**: Perfect for storing self-contained itinerary objects
- **Real-time capabilities**: Enables live status updates for frontend applications
- **Global availability**: Matches Cloudflare's global distribution
- **Secure authentication**: Service account integration for backend access

### Validation and Error Handling

The system employs multiple layers of validation and error handling:

- **Zod schema validation**: Ensures LLM outputs match expected structure
- **Retry mechanisms**: Exponential backoff for transient failures
- **Comprehensive error states**: Clear status tracking in Firestore
- **Graceful degradation**: Failed jobs are marked with descriptive error messages

---

## Prompt Design

The reliability of the application depends on the LLM consistently returning structured, valid JSON. The prompt design employs structured prompting techniques:

### Core Prompt Structure

```
Generate a structured travel itinerary for a trip to **[destination]** lasting **[durationDays]** days. 

The response must be a JSON object with an `itinerary` field containing an array of daily plans. Each day includes:
- `day` (number): The day number
- `theme` (string): A descriptive theme for the day
- `activities` (array): List of activities for the day

Each activity must specify:
- `time` (string): The time of the activity
- `description` (string): What the activity involves
- `location` (string): Where the activity takes place
```

### Technical Implementation

The prompt reliability is enforced through multiple mechanisms:

1. **Response MIME Type**: Set to `"application/json"` to explicitly request JSON formatting
2. **Response Schema**: Detailed schema definition including field types and constraints
3. **Structured Instructions**: Clear, unambiguous formatting requirements
4. **Validation Layer**: Zod validation ensures output conforms to expected structure

### Example Expected Output

```json
{
  "itinerary": [
    {
      "day": 1,
      "theme": "Arrival and City Center Exploration",
      "activities": [
        {
          "time": "10:00 AM",
          "description": "Visit the Eiffel Tower",
          "location": "Champ de Mars, Paris"
        },
        {
          "time": "2:00 PM", 
          "description": "Lunch at a local bistro",
          "location": "Latin Quarter, Paris"
        }
      ]
    }
  ]
}
```

This structured approach ensures:
- **High data integrity**: Consistent, parseable responses
- **Reduced error handling**: Minimal post-processing required
- **Direct database storage**: Responses can be saved immediately to Firestore
- **Frontend compatibility**: Structured data works seamlessly with UI components

---

## Error Handling

The system implements comprehensive error handling across multiple layers:

### LLM Request Failures
- **Retry logic**: Exponential backoff for transient API failures
- **Timeout handling**: Reasonable limits to prevent hanging requests
- **API error parsing**: Specific error messages from Gemini API

### Validation Failures
- **Schema validation**: Zod ensures response structure matches requirements
- **Type checking**: Validates data types for all fields
- **Required field verification**: Ensures all mandatory fields are present

### Database Failures
- **Firestore connection errors**: Graceful handling of database connectivity issues
- **Authentication failures**: Clear error messages for credential problems
- **Document update failures**: Retry mechanisms for database operations

### Status Tracking

All jobs maintain clear status indicators in Firestore:

```json
{
  "jobId": "unique-job-id",
  "status": "processing" | "completed" | "failed",
  "destination": "Paris, France",
  "durationDays": 3,
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:35:00Z",
  "errorMessage": "Optional error description",
  "itinerary": { /* Generated itinerary data */ }
}
```

---

## Summary and Design Rationale

This project demonstrates how to combine serverless infrastructure and AI-driven content generation into a reliable, scalable system:

### Key Benefits

- **Serverless scalability**: Cloudflare Workers handle concurrent requests without server management
- **Structured AI output**: Careful prompt design and validation ensure machine-readable itineraries
- **Resilient processing**: Asynchronous job handling and retries prevent user-facing delays
- **Transparent error states**: Firestore records both success and failure details for full transparency
- **Global performance**: Edge deployment ensures low latency worldwide
- **Cost efficiency**: Pay-per-request model with automatic scaling

### Integration Points

The system successfully integrates several cutting-edge technologies:

1. **Serverless computing** (Cloudflare Workers) for scalable API hosting
2. **Large Language Models** (Google Gemini) for intelligent content generation  
3. **NoSQL databases** (Firestore) for flexible data storage and real-time updates
4. **Schema validation** (Zod) for data integrity and type safety
5. **Asynchronous processing** for optimal user experience
6. **Modern frontend framework** (Svelte 5) for user interface and status tracking

By combining these elements, the application provides a robust travel itinerary generator that balances flexibility (LLM creativity) with control (schema validation and error management), delivering a production-ready solution that can scale to serve users globally.

---

## Development and Testing

For local development and testing:

```bash
# Run locally for testing
wrangler dev

# Test with local endpoint
curl -X POST "http://localhost:8787/api" \
  -H "Content-Type: application/json" \
  -d '{"destination": "London, UK", "durationDays": 4}'
```

The local development server allows you to test your worker before deployment, with full access to configured secrets and environment variables.

---

## Svelte 5 Frontend for Status Tracking

A simple Svelte 5 web interface is included to allow users to check the status of their itinerary generation jobs in real time.

### Features

- Single input field for a `jobId`
- On submit, queries Firestore in real time to fetch the itinerary status
- Displays:
  - `status` (`processing`, `completed`, `failed`)
  - Full `itinerary` if available
  - Error messages for failed jobs

### Accessing the Frontend

Once deployed to Cloudflare Pages, the app is available at:

```
https://<your-pages-subdomain>.pages.dev/
```

For example:

```
https://77ddd504.itinerary-status-ui.pages.dev/
```

Enter the `jobId` you received from the `/api` endpoint to view the job's status and results.

### How It Works (API Calls)

The frontend queries Firestore using the Firestore REST API. If you want to fetch the job status manually:

**Request:**

```bash
curl -X GET \
  "https://firestore.googleapis.com/v1/projects/<FIRESTORE_PROJECT_ID>/databases/(default)/documents/itineraries/<jobId>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

- Replace `<FIRESTORE_PROJECT_ID>` with your Firestore project ID
- Replace `<jobId>` with the ID returned from the `/api` endpoint
- Replace `<ACCESS_TOKEN>` with an OAuth 2.0 access token for your Firebase service account
- Replace `(default)` with your actual database name if different

**Response Example:**

```json
{
  "fields": {
    "status": { "stringValue": "completed" },
    "itinerary": { "arrayValue": { "values": [...] } },
    "errorMessage": { "nullValue": null }
  }
}
```

This is the same data the Svelte app displays, ensuring consistency between the UI and direct API calls.

### Frontend Deployment

To deploy the Svelte 5 frontend to Cloudflare Pages:

1. Build the Svelte application
2. Upload the build output to Cloudflare Pages
3. Configure environment variables for Firebase authentication
4. The frontend will be available at your Pages subdomain

The frontend provides a user-friendly way to track itinerary generation progress without needing to directly query the Firestore API or understand the underlying data structure.