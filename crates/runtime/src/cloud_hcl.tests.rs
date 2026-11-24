use super::*;

#[test]
fn test_parse_terraform_content() {
    let hcl = r#"
    terraform {
      backend "s3" {
        bucket = "my-tf-state-bucket"
        region = "eu-west-1"
      }
    }

    resource "aws_s3_bucket" "app_storage" {
      bucket = "prod-app-assets"
      tags = {
        Environment = "production"
        Project = "worklens"
      }
    }

    resource "scaleway_instance_server" "api_server" {
      type  = "PLAY2-NANO"
      image = "ubuntu_jammy"
      zone  = "fr-par-1"
      tags  = ["production", "api"]
      private_network_id = scaleway_vpc_private_network.pn.id
    }

    resource "google_compute_instance" "worker" {
      name         = "gcp-worker-1"
      machine_type = "e2-medium"
      zone         = "europe-west1-b"
    }

    module "vpc" {
      source  = "terraform-aws-modules/vpc/aws"
      version = "5.1.0"
    }

    variable "environment" {
      type        = string
      default     = "production"
      description = "Target deployment env"
    }

    output "s3_arn" {
      description = "ARN of the S3 bucket"
      sensitive   = false
    }
    "#;

    let parsed = parse_tf_file("infra/prod/main.tf", hcl);
    assert_eq!(parsed.backends.len(), 1);
    assert_eq!(parsed.backends[0].backend_type, "s3");
    assert_eq!(parsed.resources.len(), 3);

    let s3 = parsed.resources.iter().find(|r| r.name == "app_storage").unwrap();
    assert_eq!(s3.provider, CloudProvider::Aws);
    assert_eq!(s3.category, CloudResourceCategory::Storage);
    assert_eq!(s3.environment.as_deref(), Some("production"));

    let scw = parsed.resources.iter().find(|r| r.name == "api_server").unwrap();
    assert_eq!(scw.provider, CloudProvider::Scaleway);
    assert_eq!(scw.category, CloudResourceCategory::Compute);
    assert_eq!(scw.dependencies, vec!["scaleway_vpc_private_network.pn"]);

    let gcp = parsed.resources.iter().find(|r| r.name == "worker").unwrap();
    assert_eq!(gcp.provider, CloudProvider::Gcp);
    assert_eq!(gcp.category, CloudResourceCategory::Compute);

    assert_eq!(parsed.modules.len(), 1);
    assert_eq!(parsed.modules[0].name, "vpc");
    assert_eq!(parsed.modules[0].providers, vec![CloudProvider::Aws]);

    assert_eq!(parsed.variables.len(), 1);
    assert_eq!(parsed.outputs.len(), 1);
}
