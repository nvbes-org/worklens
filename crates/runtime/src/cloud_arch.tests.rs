use super::*;
use worklens_core::ScalewayServer;

#[test]
fn test_build_architecture_graph() {
    let mut attrs = HashMap::new();
    attrs.insert("type".to_string(), "PLAY2-NANO".to_string());

    let resources = vec![
        CloudResource {
            id: "scaleway_instance_server.api".to_string(),
            name: "api".to_string(),
            resource_type: "scaleway_instance_server".to_string(),
            provider: CloudProvider::Scaleway,
            category: CloudResourceCategory::Compute,
            source_file: "infra/scaleway/main.tf".to_string(),
            line_number: Some(10),
            region: Some("fr-par-1".to_string()),
            environment: Some("production".to_string()),
            attributes: attrs,
            tags: HashMap::new(),
            dependencies: vec!["scaleway_vpc_private_network.pn".to_string()],
        },
        CloudResource {
            id: "scaleway_vpc_private_network.pn".to_string(),
            name: "pn".to_string(),
            resource_type: "scaleway_vpc_private_network".to_string(),
            provider: CloudProvider::Scaleway,
            category: CloudResourceCategory::Network,
            source_file: "infra/scaleway/vpc.tf".to_string(),
            line_number: Some(2),
            region: Some("fr-par".to_string()),
            environment: Some("production".to_string()),
            attributes: HashMap::new(),
            tags: HashMap::new(),
            dependencies: Vec::new(),
        },
    ];

    let pipelines = vec![CloudDeploymentPipeline {
        id: ".github/workflows/deploy.yml".to_string(),
        name: "Deploy Production".to_string(),
        file_path: ".github/workflows/deploy.yml".to_string(),
        providers: vec![CloudProvider::Scaleway],
        triggers: vec!["push".to_string()],
        environments: vec!["production".to_string()],
        detected_actions: vec!["scaleway/action-scw".to_string()],
        deploy_jobs: vec!["deploy-infra".to_string()],
        secrets_used: vec!["SCW_SECRET_KEY".to_string()],
        is_iac: true,
    }];

    let live_server = ScalewayServer {
        id: "1111-2222".to_string(),
        name: "api".to_string(),
        status: "running".to_string(),
        commercial_type: "PLAY2-NANO".to_string(),
        zone: "fr-par-1".to_string(),
        public_ip: Some("51.159.10.20".to_string()),
        private_ip: Some("192.168.1.10".to_string()),
        image_name: Some("ubuntu".to_string()),
        tags: vec!["production".to_string()],
    };

    let scaleway_live = ScalewayLiveReport {
        connected: true,
        auth_source: "keychain".to_string(),
        project_id: Some("proj-123".to_string()),
        servers: vec![live_server],
        databases: Vec::new(),
        k8s_clusters: Vec::new(),
        private_networks: Vec::new(),
        error: None,
        fetched_at: "2026-10-22T10:00:00Z".to_string(),
    };

    let graph = build_architecture_graph(&resources, &[], &pipelines, Some(&scaleway_live));

    // Verify nodes
    assert_eq!(graph.nodes.len(), 3); // 2 resources + 1 pipeline
    let api_node = graph.nodes.iter().find(|n| n.id == "scaleway_instance_server.api").unwrap();
    assert_eq!(api_node.status.as_deref(), Some("running"));
    assert!(api_node.is_live);
    assert_eq!(api_node.metadata.get("public_ip").map(String::as_str), Some("51.159.10.20"));

    // Verify edges
    let net_edge = graph.edges.iter().find(|e| e.source == "scaleway_instance_server.api" && e.target == "scaleway_vpc_private_network.pn").unwrap();
    assert_eq!(net_edge.relation, "network");

    let deploy_edge = graph.edges.iter().find(|e| e.source == "pipeline:.github/workflows/deploy.yml").unwrap();
    assert_eq!(deploy_edge.relation, "deploys");
}
