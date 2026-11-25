use super::*;

#[test]
fn test_parse_deployment_workflow() {
    let yaml = r#"
name: Deploy Production
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-infra:
    name: Terraform Apply
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1
      - run: terraform init && terraform apply -auto-approve

  deploy-scaleway:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: scaleway/action-scw@v2
        with:
          scw-secret-key: ${{ secrets.SCW_SECRET_KEY }}
          scw-organization-id: ${{ secrets.SCW_ORGANIZATION_ID }}
"#;

    let pipeline = parse_workflow_file(".github/workflows/deploy.yml", yaml).unwrap();
    assert_eq!(pipeline.name, "Deploy Production");
    assert!(pipeline.is_iac);
    assert!(pipeline.providers.contains(&CloudProvider::Aws));
    assert!(pipeline.providers.contains(&CloudProvider::Scaleway));
    assert!(pipeline.triggers.contains(&"push".to_string()));
    assert!(pipeline.triggers.contains(&"workflow_dispatch".to_string()));
    assert!(pipeline.environments.contains(&"production".to_string()));
    assert!(pipeline.environments.contains(&"staging".to_string()));
    assert!(pipeline.secrets_used.contains(&"AWS_ACCESS_KEY_ID".to_string()));
    assert!(pipeline.secrets_used.contains(&"SCW_SECRET_KEY".to_string()));
}
