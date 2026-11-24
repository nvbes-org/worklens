use tempfile::tempdir;
use worklens_core::EngineKind;
use worklens_runtime::{
    engines::{builtins, EngineRegistry},
    permissions::PermissionManager,
    plugins::PluginManager,
};

#[tokio::test]
async fn test_plugin_installation_and_engine_sync() {
    let dir = tempdir().unwrap();
    let plugins_dir = dir.path().join("plugins");
    let db_path = dir.path().join("test.sqlite3");
    let pm = PermissionManager::open(&db_path).unwrap();
    let registry = EngineRegistry::new();
    builtins::register_all(&registry);

    // Initial builtin engines list
    let initial_engines = registry.list().await;
    assert_eq!(initial_engines.len(), 14); // pnpm, npm, yarn, cargo, nx, iac, git, scw, gh, docker, oci, apple-container, kubernetes, devcontainer
    assert!(initial_engines.iter().any(|e| e.id == "docker" && e.kind == EngineKind::Container));
    assert!(initial_engines.iter().any(|e| e.id == "oci" && e.kind == EngineKind::Container));
    assert!(initial_engines.iter().any(|e| e.id == "apple-container" && e.kind == EngineKind::Container));
    assert!(initial_engines.iter().any(|e| e.id == "kubernetes" && e.kind == EngineKind::Kubernetes));
    assert!(initial_engines.iter().any(|e| e.id == "devcontainer" && e.kind == EngineKind::Container));

    // Create a mock plugin source directory
    let plugin_src = dir.path().join("my-custom-plugin");
    std::fs::create_dir_all(&plugin_src).unwrap();
    let manifest_json = r#"{
        "id": "my-tofu-ext",
        "name": "Custom OpenTofu Extension",
        "version": "1.2.0",
        "engines": [
            {
                "id": "tofu-custom",
                "name": "Tofu Custom Engine",
                "kind": "iac",
                "binaries": ["tofu"],
                "manifestPatterns": ["*.tofu"],
                "supportedActions": ["plan", "validate"]
            }
        ],
        "permissions": [
            {
                "kind": "exec_command",
                "binary": "tofu",
                "allowedArgsPatterns": ["plan", "validate"],
                "allowMutation": false
            }
        ]
    }"#;
    std::fs::write(plugin_src.join("plugin.json"), manifest_json).unwrap();

    // Install the plugin
    let manager = PluginManager::new(Some(plugins_dir));
    let installed = manager.install(&plugin_src).unwrap();
    assert_eq!(installed.id, "my-tofu-ext");
    assert_eq!(installed.engines_count, 1);

    // Sync engines into registry
    manager.sync_engines(&registry, &pm).unwrap();

    let updated_engines = registry.list().await;
    assert_eq!(updated_engines.len(), 15);
    assert!(updated_engines.iter().any(|e| e.id == "tofu-custom" && e.kind == EngineKind::IaC));

    // Verify permission was granted
    let grants = pm.list_grants(Some("my-tofu-ext")).unwrap();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].plugin_id, "my-tofu-ext");
}
