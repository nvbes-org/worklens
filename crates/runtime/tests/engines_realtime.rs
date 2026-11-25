use tempfile::tempdir;
use worklens_core::{EngineKind, Repository};
use worklens_runtime::{
    engines::{builtins, EngineRegistry},
    permissions::PermissionManager,
};

#[tokio::test]
async fn test_realtime_engines_registration_and_discovery() {
    let registry = EngineRegistry::new();
    builtins::register_all(&registry);

    // Verify all 5 new engines exist in registry
    let docker = registry.get("docker").expect("docker engine must be registered");
    assert_eq!(docker.id(), "docker");
    assert_eq!(docker.kind(), EngineKind::Container);
    assert!(docker.binaries().contains(&"docker".to_string()));

    let oci = registry.get("oci").expect("oci engine must be registered");
    assert_eq!(oci.id(), "oci");
    assert_eq!(oci.kind(), EngineKind::Container);
    assert!(oci.binaries().contains(&"podman".to_string()));

    let apple = registry.get("apple-container").expect("apple-container engine must be registered");
    assert_eq!(apple.id(), "apple-container");
    assert_eq!(apple.kind(), EngineKind::Container);

    let k8s = registry.get("kubernetes").expect("kubernetes engine must be registered");
    assert_eq!(k8s.id(), "kubernetes");
    assert_eq!(k8s.kind(), EngineKind::Kubernetes);

    let devcontainer = registry.get("devcontainer").expect("devcontainer engine must be registered");
    assert_eq!(devcontainer.id(), "devcontainer");
    assert_eq!(devcontainer.kind(), EngineKind::Container);
}

#[tokio::test]
async fn test_realtime_status_collection() {
    let registry = EngineRegistry::new();
    builtins::register_all(&registry);

    let dir = tempdir().unwrap();
    let repo = Repository {
        id: "repo_test".into(),
        name: "test-repo".into(),
        path: dir.path().to_string_lossy().to_string(),
        common_dir: dir.path().join(".git").to_string_lossy().to_string(),
        trusted: true,
    };

    // Test realtime_list collects without hanging or blocking
    let realtime_statuses = registry.realtime_list(Some(&repo)).await;
    assert!(!realtime_statuses.is_empty());

    let docker_status = realtime_statuses.iter().find(|s| s.engine_id == "docker");
    assert!(docker_status.is_some(), "docker status must be collected");
    let d = docker_status.unwrap();
    assert_eq!(d.kind, EngineKind::Container);

    let k8s_status = realtime_statuses.iter().find(|s| s.engine_id == "kubernetes");
    assert!(k8s_status.is_some(), "k8s status must be collected");
    let k = k8s_status.unwrap();
    assert_eq!(k.kind, EngineKind::Kubernetes);

    // Test specific realtime_status queries
    let devcontainer_status = registry.realtime_status("devcontainer", Some(&repo)).await.unwrap();
    assert_eq!(devcontainer_status.engine_id, "devcontainer");

    let oci_status = registry.realtime_status("oci", Some(&repo)).await.unwrap();
    assert_eq!(oci_status.engine_id, "oci");
}

#[tokio::test]
async fn test_devcontainer_detection_with_manifest() {
    let dir = tempdir().unwrap();
    let devcontainer_dir = dir.path().join(".devcontainer");
    std::fs::create_dir_all(&devcontainer_dir).unwrap();

    let cfg_json = r#"{
        "name": "Rust & Node Dev Environment",
        "image": "mcr.microsoft.com/devcontainers/rust:latest",
        "forwardPorts": [3000, 8080]
    }"#;
    std::fs::write(devcontainer_dir.join("devcontainer.json"), cfg_json).unwrap();

    let registry = EngineRegistry::new();
    builtins::register_all(&registry);

    let devcontainer = registry.get("devcontainer").unwrap();
    let detected = devcontainer.detect(dir.path()).await.unwrap();
    assert!(detected, "Devcontainer must be detected when .devcontainer/devcontainer.json exists");

    let repo = Repository {
        id: "repo_devcontainer".into(),
        name: "devcontainer-repo".into(),
        path: dir.path().to_string_lossy().to_string(),
        common_dir: dir.path().join(".git").to_string_lossy().to_string(),
        trusted: true,
    };

    let status = devcontainer.collect_realtime_status(Some(&repo)).await.unwrap().unwrap();
    assert_eq!(status.engine_id, "devcontainer");
    assert_eq!(status.instances.len(), 1);
    assert_eq!(status.instances[0].name, "Rust & Node Dev Environment");
    assert_eq!(status.instances[0].image, "mcr.microsoft.com/devcontainers/rust:latest");
    assert_eq!(status.instances[0].ports, vec!["3000", "8080"]);
}

#[tokio::test]
async fn test_engine_permissions_and_mutating_actions() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("perms.sqlite3");
    let pm = PermissionManager::open(&db_path).unwrap();

    let registry = EngineRegistry::new();
    builtins::register_all(&registry);

    // Untrusted repository
    let untrusted_repo = Repository {
        id: "repo_untrusted".into(),
        name: "untrusted-repo".into(),
        path: dir.path().to_string_lossy().to_string(),
        common_dir: dir.path().join(".git").to_string_lossy().to_string(),
        trusted: false,
    };

    // Attempting a mutating action (e.g. stop) without repository trust or permission grant must fail
    let res = registry
        .execute(
            "docker",
            "stop",
            &serde_json::json!({ "containerId": "test1234" }),
            &untrusted_repo,
            "external_client",
            &pm,
        )
        .await;

    assert!(res.is_err(), "Mutating action on untrusted repository without grant must be denied");
}
