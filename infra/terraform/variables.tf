variable "environment" {
  type    = string
  default = "production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}
variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}
variable "api_image" {
  type        = string
  description = "Immutable API ECR image digest"
}
variable "worker_image" {
  type        = string
  description = "Immutable worker ECR image digest"
}
variable "admin_image" {
  type        = string
  description = "Immutable admin ECR image digest"
}
variable "database_instance_class" {
  type    = string
  default = "db.r7g.large"
}
variable "redis_node_type" {
  type    = string
  default = "cache.r7g.large"
}
variable "domain_name" {
  type    = string
  default = ""
}
variable "route53_zone_id" {
  type    = string
  default = ""
}
variable "application_secrets" {
  type        = map(string)
  sensitive   = true
  default     = {}
  description = "Auth0, Stripe, Deepgram, SES, cursor, metrics, and webhook secrets stored in Secrets Manager"
}
