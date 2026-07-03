terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.region
}

# 1. Enable Required GCP APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "script.googleapis.com",
    "drive.googleapis.com",
    "sheets.googleapis.com",
    "run.googleapis.com",
    "iam.googleapis.com",
    "apikeys.googleapis.com"
  ])

  service            = each.key
  disable_on_destroy = false
}

# 2. Service Account for BZQ Engine Execution
resource "google_service_account" "bzq_backend_sa" {
  account_id   = "bzq-backend-${var.environment}"
  display_name = "BZQ Platform Engine Service Account (${var.environment})"
  depends_on   = [google_project_service.apis]
}

# 3. Cloud Run Service (Hosting BZQ Gemini MCP Server / API Engine)
resource "google_cloud_run_v2_service" "bzq_engine" {
  name     = "bzq-engine-${var.environment}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.bzq_backend_sa.email

    containers {
      image = "gcr.io/${var.gcp_project_id}/bzq-engine:latest" # Deployed via Cloud Build or GitHub Actions

      env {
        name  = "ENV"
        value = var.environment
      }
      env {
        name  = "PROJECT_ID"
        value = var.gcp_project_id
      }
      env {
        name  = "DOMAIN"
        value = var.organization_domain
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# 4. Make Cloud Run Service publicly accessible (Workspace Add-on endpoints require HTTPS access)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  name     = google_cloud_run_v2_service.bzq_engine.name
  location = google_cloud_run_v2_service.bzq_engine.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 5. Output Cloud Run Service URL to assist Add-on manifest configurations
output "engine_url" {
  value       = google_cloud_run_v2_service.bzq_engine.uri
  description = "The HTTPS URL of the deployed BZQ API Engine / MCP Server"
}
