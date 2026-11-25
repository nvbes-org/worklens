use tempfile::tempdir;
use worklens_core::PermissionType;
use worklens_runtime::permissions::PermissionManager;

#[test]
fn test_permission_manager_zero_trust_and_auditing() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.sqlite3");
    let pm = PermissionManager::open(&db_path).unwrap();

    let plugin_id = "test-plugin";

    // 1. Zero-trust: by default ungranted command is denied
    let check1 = pm.check_exec(plugin_id, "terraform", &["show".into(), "-json".into()], false, true);
    assert!(check1.is_err());

    // 2. Grant permission
    let grant_perm = PermissionType::ExecCommand {
        binary: "terraform".into(),
        allowed_args_patterns: vec!["^show".into()],
        allow_mutation: false,
    };
    pm.grant(plugin_id, "perm_tf_show", grant_perm).unwrap();

    // 3. Now allowed when matching args
    let check2 = pm.check_exec(plugin_id, "terraform", &["show".into(), "-json".into()], false, true);
    assert!(check2.is_ok());

    // 3b. Argument mismatch is denied
    let check2b = pm.check_exec(plugin_id, "terraform", &["destroy".into()], false, true);
    assert!(check2b.is_err());

    // 4. Denied if attempting to mutate without trust
    let exec_mut = PermissionType::ExecCommand {
        binary: "terraform".into(),
        allowed_args_patterns: vec!["apply".into()],
        allow_mutation: true,
    };
    let check3 = pm.check(plugin_id, &exec_mut, false).unwrap();
    assert!(!check3.allowed); // Untrusted repository refuses mutation

    // 5. Filesystem scope tests
    let fs_perm = PermissionType::FsRead {
        paths: vec!["**/*.tf".into()],
    };
    pm.grant(plugin_id, "perm_fs_tf", fs_perm).unwrap();
    assert!(pm.check_fs_read(plugin_id, "infra/main.tf").is_ok());
    assert!(pm.check_fs_read(plugin_id, "secret/keys.json").is_err());

    // 6. Verify audit trail was recorded in SQLite
    let audit_logs = pm.list_audit_logs(20, Some(plugin_id)).unwrap();
    assert!(!audit_logs.is_empty());
    assert!(audit_logs.iter().any(|a| a.decision == "allowed"));
    assert!(audit_logs.iter().any(|a| a.decision == "denied"));
}
