data "aws_availability_zones" "available" {
  state = "available"
}
locals {
  name = "voiceforge-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  tags = {
    Application = "VoiceForge"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = local.name
  }
}
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-${count.index}"
  }
}
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  tags = {
    Name = "${local.name}-private-${count.index}"
  }
}
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
}
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "app" {
  name   = "${local.name}-app"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 3000
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "data" {
  name   = "${local.name}-data"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}
resource "random_password" "database" {
  length  = 32
  special = false
}
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}
resource "aws_db_instance" "postgres" {
  identifier                   = local.name
  engine                       = "postgres"
  engine_version               = "17"
  instance_class               = var.database_instance_class
  allocated_storage            = 100
  max_allocated_storage        = 1000
  storage_encrypted            = true
  multi_az                     = true
  db_name                      = "voiceforge"
  username                     = "voiceforge"
  password                     = random_password.database.result
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [aws_security_group.data.id]
  backup_retention_period      = 35
  deletion_protection          = var.environment == "production"
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
  performance_insights_enabled = true
  auto_minor_version_upgrade   = true
}
resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.name
  description                = "VoiceForge jobs"
  node_type                  = var.redis_node_type
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  num_cache_clusters         = 2
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = 7
}
resource "aws_s3_bucket" "audio" {
  bucket = "${local.name}-audio-${data.aws_caller_identity.current.account_id}"
}
resource "aws_s3_bucket" "exports" {
  bucket = "${local.name}-exports-${data.aws_caller_identity.current.account_id}"
}
data "aws_caller_identity" "current" {}
resource "aws_s3_bucket_public_access_block" "private" {
  for_each = {
    audio = aws_s3_bucket.audio.id, exports = aws_s3_bucket.exports.id
  }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "encrypted" {
  for_each = {
    audio = aws_s3_bucket.audio.id, exports = aws_s3_bucket.exports.id
  }
  bucket = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = 2
    }
  }
}
resource "aws_ecr_repository" "service" {
  for_each             = toset(["api", "worker", "admin"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}
resource "aws_cloudwatch_log_group" "service" {
  for_each          = toset(["api", "worker", "admin"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 90
}
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }, Action = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/application"
  recovery_window_in_days = 30
}
locals {
  runtime_secrets = merge(var.application_secrets, {
    DATABASE_URL = "postgresql://voiceforge:${random_password.database.result}@${aws_db_instance.postgres.address}:5432/voiceforge", REDIS_URL = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379", S3_AUDIO_BUCKET = aws_s3_bucket.audio.id, S3_EXPORT_BUCKET = aws_s3_bucket.exports.id, AWS_REGION = var.aws_region
  })
}
resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(local.runtime_secrets)
}
resource "aws_iam_role_policy" "runtime" {
  name = "${local.name}-runtime"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = ["${aws_s3_bucket.audio.arn}/*", "${aws_s3_bucket.exports.arn}/*"]
      }, {
      Effect = "Allow", Action = ["ses:SendEmail", "ses:SendRawEmail"], Resource = "*"
      }, {
      Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.app.arn
    }]
  })
}
resource "aws_lb" "main" {
  name               = substr(local.name, 0, 32)
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]
}
resource "aws_lb_target_group" "service" {
  for_each = {
    api = 3000, admin = 3001
  }
  name        = substr("${local.name}-${each.key}", 0, 32)
  port        = each.value
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path                = each.key == "api" ? "/v1/health" : "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}
resource "aws_acm_certificate" "main" {
  count                     = var.domain_name == "" ? 0 : 1
  domain_name               = var.domain_name
  subject_alternative_names = ["api.${var.domain_name}"]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}
resource "aws_route53_record" "validation" {
  for_each = var.domain_name == "" ? {} : { for option in aws_acm_certificate.main[0].domain_validation_options : option.domain_name => {
    name = option.resource_record_name, record = option.resource_record_value, type = option.resource_record_type
    }
  }
  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}
resource "aws_acm_certificate_validation" "main" {
  count                   = var.domain_name == "" ? 0 : 1
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = var.domain_name == "" ? 80 : 443
  protocol          = var.domain_name == "" ? "HTTP" : "HTTPS"
  certificate_arn   = var.domain_name == "" ? null : aws_acm_certificate_validation.main[0].certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["admin"].arn
  }
}
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["api"].arn
  }
  condition {
    path_pattern {
      values = ["/v1/*", "/documentation*"]
    }
  }
}
locals {
  images = {
    api = var.api_image, worker = var.worker_image, admin = var.admin_image
  }
  ports = {
    api = 3000, worker = 0, admin = 3001
  }
}
resource "aws_ecs_task_definition" "service" {
  for_each                 = local.images
  family                   = "${local.name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.key == "worker" ? 1024 : 512
  memory                   = each.key == "worker" ? 2048 : 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.execution.arn
  container_definitions = jsonencode([{
    name = each.key, image = each.value, essential = true, readonlyRootFilesystem = true, portMappings = local.ports[each.key] == 0 ? [] : [{
      containerPort = local.ports[each.key], protocol = "tcp"
      }], secrets = [for name in keys(local.runtime_secrets) : {
      name = name, valueFrom = "${aws_secretsmanager_secret.app.arn}:${name}::"
      }], logConfiguration = {
      logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.service[each.key].name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = each.key
      }
      }, healthCheck = each.key == "api" ? {
      command = ["CMD-SHELL", "node -e \"fetch('http://localhost:3000/v1/health').then(r=>process.exit(r.ok?0:1))\""], interval = 30, timeout = 5, retries = 3, startPeriod = 30
    } : null
  }])
}
resource "aws_ecs_service" "service" {
  for_each                           = local.images
  name                               = each.key
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  desired_count                      = each.key == "worker" ? 2 : 2
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.key == "worker" ? [] : [1]
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = local.ports[each.key]
    }
  }
}
resource "aws_wafv2_web_acl" "main" {
  name  = local.name
  scope = "REGIONAL"
  default_action {
    allow {}
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = true
  }
  rule {
    name     = "rate-limit"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = 2000
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }
}
resource "aws_wafv2_web_acl_association" "main" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
resource "aws_cloudfront_distribution" "admin" {
  enabled         = true
  is_ipv6_enabled = true
  aliases         = var.domain_name == "" ? [] : [var.domain_name]
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "admin-alb"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = var.domain_name == "" ? "http-only" : "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]

    }

  }
  default_cache_behavior {
    target_origin_id       = "admin-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Cookie", "Host"]
      cookies {
        forward = "all"
      }

    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0

  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == ""
    acm_certificate_arn            = var.domain_name == "" ? null : aws_acm_certificate_validation.main[0].certificate_arn
    ssl_support_method             = var.domain_name == "" ? null : "sni-only"
    minimum_protocol_version       = var.domain_name == "" ? "TLSv1" : "TLSv1.2_2021"

  }
}
resource "aws_route53_record" "admin" {
  count   = var.domain_name == "" ? 0 : 1
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
    evaluate_target_health = false
  }
}
resource "aws_route53_record" "api" {
  count   = var.domain_name == "" ? 0 : 1
  zone_id = var.route53_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }
}
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.name}-api-p95-latency"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0.5
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }
}
resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = local.name
  dashboard_body = jsonencode({
    widgets = [{
      type = "metric", width = 12, height = 6, properties = {
        title = "API latency and errors", region = var.aws_region, metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix, { stat = "p95" }], [".", "HTTPCode_Target_5XX_Count", ".", ".", { stat = "Sum", yAxis = "right" }]], period = 60
      }
      }, {
      type = "log", width = 12, height = 6, properties = {
        title = "Recent application errors", region = var.aws_region, query = "SOURCE '${aws_cloudwatch_log_group.service["api"].name}' | fields @timestamp, level, msg, requestId | filter level >= 50 | sort @timestamp desc | limit 50", view = "table"
      }
    }]
  })
}
resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-migration"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.execution.arn
  container_definitions = jsonencode([{
    name = "migration", image = var.api_image, essential = true, command = ["node", "dist/migrate.js"], secrets = [for name in keys(local.runtime_secrets) : {
      name = name, valueFrom = "${aws_secretsmanager_secret.app.arn}:${name}::"
      }], logConfiguration = {
      logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.service["api"].name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "migration"
      }
    }
  }])
}
