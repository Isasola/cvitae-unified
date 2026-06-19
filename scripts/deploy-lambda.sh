#!/usr/bin/env bash
# deploy-lambda.sh — Build and deploy CVitae functions to AWS Lambda (us-east-1)
#
# Prerequisites:
#   - AWS CLI configured with cvitae-dev IAM credentials
#   - pnpm installed globally
#   - Lambda functions already created in AWS console (see CONTEXT.md "Lambda deployment")
#
# Usage:
#   chmod +x scripts/deploy-lambda.sh
#   ./scripts/deploy-lambda.sh [function-name]
#   ./scripts/deploy-lambda.sh          # deploys all functions
#   ./scripts/deploy-lambda.sh analyze-cv-candidate

set -euo pipefail

REGION="${CVITAE_AWS_REGION:-us-east-1}"
FUNCTIONS_DIR="netlify/functions"
BUILD_DIR=".lambda-build"
DEPLOY_FUNCTIONS=(
  "analyze-cv-candidate"
  "compare-candidates"
  "generate-cv-vivo"
  "analyze-recruiters-batch"
  "extract-pdf-text"
)

# Allow deploying a single function via first argument
if [[ -n "${1:-}" ]]; then
  DEPLOY_FUNCTIONS=("$1")
fi

echo "==> Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

for FN in "${DEPLOY_FUNCTIONS[@]}"; do
  SRC="$FUNCTIONS_DIR/${FN}.ts"
  if [[ ! -f "$SRC" ]]; then
    echo "WARN: $SRC not found, skipping."
    continue
  fi

  echo ""
  echo "==> Building $FN..."

  WORK_DIR="$BUILD_DIR/$FN"
  mkdir -p "$WORK_DIR"

  # Compile with esbuild — same bundler as netlify.toml uses
  npx esbuild "$SRC" \
    --bundle \
    --platform=node \
    --target=node20 \
    --external:@aws-sdk/client-bedrock-runtime \
    --external:@supabase/supabase-js \
    --outfile="$WORK_DIR/index.js" \
    --define:process.env.NODE_ENV='"production"'

  # Lambda entry point: wrap Netlify handler to APIGateway format
  cat >> "$WORK_DIR/index.js" << 'EOF'

// Lambda adapter — Netlify Handler → APIGateway ProxyHandler
if (typeof exports.handler === 'function') {
  const netlifyHandler = exports.handler;
  exports.handler = async (event, context) => {
    const netlifyEvent = {
      httpMethod: event.httpMethod || event.requestContext?.http?.method || 'POST',
      body: event.body || null,
      headers: event.headers || {},
      queryStringParameters: event.queryStringParameters || {},
      path: event.path || event.rawPath || '/',
    };
    const result = await netlifyHandler(netlifyEvent, context);
    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json', ...(result.headers || {}) },
      body: result.body,
    };
  };
}
EOF

  # Zip for Lambda
  ZIP_FILE="$BUILD_DIR/${FN}.zip"
  (cd "$WORK_DIR" && zip -r "../../${ZIP_FILE}" .)
  echo "    Built: $ZIP_FILE"

  # Deploy
  echo "==> Deploying $FN to Lambda (region: $REGION)..."
  aws lambda update-function-code \
    --function-name "cvitae-${FN}" \
    --zip-file "fileb://${ZIP_FILE}" \
    --region "$REGION" \
    --no-cli-pager

  echo "    Done: cvitae-${FN}"
done

echo ""
echo "==> All done. Lambda functions updated."
echo "    Remember to set environment variables in Lambda console:"
echo "      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
echo "      CVITAE_AWS_ACCESS_KEY_ID, CVITAE_AWS_SECRET_ACCESS_KEY, CVITAE_AWS_REGION"
echo "      RESEND_API_KEY, SITE_URL"
