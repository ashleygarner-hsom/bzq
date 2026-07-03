variable "gcp_project_id" {
  type        = string
  description = "The target Google Cloud Platform project ID"
}

variable "region" {
  type        = string
  description = "The default GCP region to deploy resources in"
  default     = "us-east1"
}

variable "environment" {
  type        = string
  description = "Environment identifier (alpha, beta, uat, prod)"
}

variable "organization_domain" {
  type        = string
  description = "Domain name for Google Workspace integration"
  default     = "hsomadvisors.com"
}
