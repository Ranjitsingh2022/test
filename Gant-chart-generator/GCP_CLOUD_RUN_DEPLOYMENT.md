# Enterprise GCP Cloud Run Deployment Guide

**Application:** AI Gantt Generator  
**Runtime:** Node.js 20+ (ES Modules)  
**Target Infrastructure:** Google Cloud Run (Fully Managed Serverless Container)  
**Security Standard:** Enterprise Hardened (Non-root user `node`, Cloud Secret Manager integration, Health probes, Graceful shutdown handling)

---

## 1. Architecture Overview

The **AI Gantt Generator** is a production-ready, lightweight full-stack web application designed for zero-maintenance container execution:
- **Backend Service:** Express.js 5+ server running Node.js (`server.js`), providing:
  - `/api/chat`: Secure server-side proxy communicating with the Google Gemini API (`@google/genai`) using `gemini-2.5-flash`.
  - `/api/health` and `/health`: Standard liveness and readiness probe endpoints.
  - Graceful `SIGTERM` / `SIGINT` container lifecycle handling.
- **Frontend Client:** Single Page Application (`index.html`) delivered statically with client-side state management, interactive timeline rendering, and client-side `.pptx` presentation generation.
- **Branding Assets:** `Logo Gantt.png` served statically.

---

## 2. Prerequisites & Permissions

Before deployment, ensure the following Google Cloud services and IAM permissions are configured in your GCP Project:

### 2.1 Enable Required GCP APIs
```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

### 2.2 Dedicated Service Account (Recommended)
Create a dedicated service account for the Cloud Run service:
```bash
gcloud iam service-accounts create sa-ai-gantt-generator \
  --description="Runtime Service Account for AI Gantt Generator" \
  --display-name="SA AI Gantt Generator"
```

---

## 3. Secret Management (`GEMINI_API_KEY`)

The Gemini API key should **never** be hardcoded or passed in plaintext. Use Google Cloud Secret Manager.

### 3.1 Store the API Key in Secret Manager
```bash
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic"
```

### 3.2 Grant Access to the Cloud Run Service Account
```bash
PROJECT_ID=$(gcloud config get-value project)

gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:sa-ai-gantt-generator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Deployment Methods

Choose the deployment method that fits your organization's workflow:

### Option A: Cloud Build + Direct Cloud Run Deployment (Fastest)

1. **Submit Build to Google Artifact Registry:**
   ```bash
   REGION="europe-west2" # Or your target GCP region (e.g. us-central1)
   PROJECT_ID=$(gcloud config get-value project)
   REPO_NAME="cloud-run-apps"

   # Create Artifact Registry Docker repository if it doesn't exist
   gcloud artifacts repositories create ${REPO_NAME} \
     --repository-format=docker \
     --location=${REGION} \
     --description="Docker repository for Cloud Run services" 2>/dev/null || true

   # Build and push the image using Google Cloud Build
   gcloud builds submit --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ai-gantt-generator:latest .
   ```

2. **Deploy to Google Cloud Run:**
   ```bash
   gcloud run deploy ai-gantt-generator \
     --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ai-gantt-generator:latest \
     --region=${REGION} \
     --platform=managed \
     --service-account=sa-ai-gantt-generator@${PROJECT_ID}.iam.gserviceaccount.com \
     --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
     --memory=512Mi \
     --cpu=1 \
     --min-instances=0 \
     --max-instances=10 \
     --concurrency=80 \
     --timeout=60 \
     --allow-unauthenticated # Or omit to require corporate IAM / Cloud IAP authentication
   ```

---

### Option B: Importing into an Existing Enterprise Base Image / Docker Pipeline

If your security policy mandates building on top of an existing corporate Golden Image (e.g. enterprise hardened Node base image):

1. **Review the Application Files Needed:**
   The application requires only the following minimal files from the root repository:
   - `package.json` & `package-lock.json`
   - `server.js`
   - `index.html`
   - `Logo Gantt.png`

2. **Dockerfile Integration Pattern:**
   In your existing enterprise Dockerfile or pipeline:
   ```dockerfile
   FROM your-enterprise-registry/node-base:20-alpine AS runtime

   WORKDIR /app
   ENV NODE_ENV=production
   ENV PORT=8080

   # Install production dependencies
   COPY package.json package-lock.json* ./
   RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

   # Copy application source files
   COPY server.js ./
   COPY index.html ./
   COPY Logo\ Gantt.png ./

   # Ensure non-root ownership
   RUN chown -R node:node /app
   USER node

   EXPOSE 8080
   CMD ["node", "server.js"]
   ```

---

## 5. Local Container Testing (Pre-flight Validation)

To verify the container prior to pushing to GCP:

1. **Build the container locally:**
   ```bash
   docker build -t ai-gantt-generator:local .
   ```

2. **Run container with your API key:**
   ```bash
   docker run --rm -p 8080:8080 \
     -e PORT=8080 \
     -e GEMINI_API_KEY="your-gemini-api-key" \
     ai-gantt-generator:local
   ```

3. **Verify health check:**
   ```bash
   curl http://localhost:8080/api/health
   # Expected Output: {"status":"healthy","timestamp":"...","service":"ai-gantt-generator","version":"1.0.0"}
   ```

4. **Access in browser:**
   Open `http://localhost:8080` to verify the UI and branding logo.

---

## 6. Cloud Run Operational Specifications

| Specification | Value / Recommendation | Notes |
| :--- | :--- | :--- |
| **Port Binding** | `process.env.PORT` (defaults to `8080`) | Dynamically listens on the port assigned by Cloud Run ingress. |
| **Health Check Path** | `/api/health` | Returns HTTP 200 with service status JSON. |
| **Memory Allocation** | `512Mi` to `1Gi` | Lightweight memory footprint (< 120MB baseline). |
| **CPU Allocation** | `1 vCPU` | Sufficient for concurrent request routing and SSR proxying. |
| **Concurrency** | `80` | High-throughput asynchronous event loop. |
| **Scaling** | `0` min to `10` max | Scales to zero when idle to eliminate unnecessary cloud costs. |
| **Lifecycle** | `SIGTERM` / `SIGINT` | Graceful shutdown listener included in `server.js`. |

---

## 7. Clean Repository Checklist for Export

When exporting via the **AI Studio Zip Option**, the bundle contains:
- `server.js`: Enterprise-commented production server.
- `index.html`: Optimized single-page Gantt chart UI with responsive layout and `.pptx` exporter.
- `Logo Gantt.png`: High-resolution branding logo.
- `package.json`: Streamlined production dependencies (`express`, `@google/genai`, `dotenv`).
- `Dockerfile` & `.dockerignore`: Container configuration hardened for Cloud Run.
- `GCP_CLOUD_RUN_DEPLOYMENT.md`: This deployment documentation.
- `metadata.json` & `.env.example`: Configuration and schema definitions.
