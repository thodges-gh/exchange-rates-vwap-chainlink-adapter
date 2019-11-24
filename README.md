# Chainlink Kaiko External Adapter - VWAP aggregating version

## Install & build

```bash
npm install
npm run build
```

## Test

```bash
npm test
```

## Environment variables

Refer to https://docs.kaiko.com for information about instruments and assets.

- `API_KEY`: Kaiko Market Data API key
- `BASE_ASSET`: Base asset to include VWAP for


## Input parameters

```
{
  interval: 1m|2m|3m|5m|10m|15m|30m|1h|2h|3h|4h|1d
  coin: 'string'
}
```

## Create the zip

```bash
zip -r cl-kaiko.zip .
```

## Install to AWS Lambda

- In Lambda Functions, create function
- On the Create function page:
  - Give the function a name
  - Use Node.js 8.10 for the runtime
  - Choose an existing role or create a new one
  - Click Create Function
- Under Function code, select "Upload a .zip file" from the Code entry type drop-down
- Click Upload and select the `cl-kaiko.zip` file
- Handler should remain index.handler
- Add the environment variable:
  - Key: API_KEY
  - Value: Your_API_key
- Save

## Install to GCP

- In Functions, create a new function, choose to ZIP upload
- Click Browse and select the `cl-kaiko.zip` file
- Select a Storage Bucket to keep the zip in
- Function to execute: gcpservice
- Click More, Add variable
  - NAME: API_KEY
  - VALUE: Your_API_key
