output "load_balancer_dns" {
  value = aws_lb.main.dns_name
}
output "database_endpoint" {
  value     = aws_db_instance.postgres.address
  sensitive = true
}
output "redis_endpoint" {
  value     = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive = true
}
output "audio_bucket" {
  value = aws_s3_bucket.audio.id
}
output "exports_bucket" {
  value = aws_s3_bucket.exports.id
}
output "ecr_repositories" {
  value = { for key, repo in aws_ecr_repository.service : key => repo.repository_url
  }
}
