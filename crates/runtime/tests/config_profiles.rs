use tempfile::tempdir;
use worklens_core::{ConfigProfile, TlsMode};
use worklens_runtime::storage::Store;

#[test]
fn test_config_profiles_crud_and_activation() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.sqlite3");
    let store = Store::open(&db_path).unwrap();

    // Default profile exists automatically
    let active = store.get_active_config_profile().unwrap();
    assert_eq!(active.id, "profile_default");
    assert!(active.is_active);

    // Create a new custom security profile
    let mut custom = ConfigProfile::default_local();
    custom.id = "profile_secure_vpn".into();
    custom.name = "Secure Corporate VPN".into();
    custom.network.tls.mode = TlsMode::Required;
    custom.network.proxy.enabled = true;
    custom.network.proxy.url = Some("socks5://127.0.0.1:1080".into());
    custom.transports.api_enabled = true;
    custom.transports.api_port = 8443;

    store.save_config_profile(&custom).unwrap();

    let list = store.list_config_profiles().unwrap();
    assert_eq!(list.len(), 2);

    // Switch active profile
    store.set_active_config_profile("profile_secure_vpn").unwrap();
    let updated_active = store.get_active_config_profile().unwrap();
    assert_eq!(updated_active.id, "profile_secure_vpn");
    assert!(updated_active.is_active);

    // Cannot delete active profile
    assert!(store.delete_config_profile("profile_secure_vpn").is_err());

    // Switch back and delete custom profile
    store.set_active_config_profile("profile_default").unwrap();
    assert!(store.delete_config_profile("profile_secure_vpn").unwrap());
    assert_eq!(store.list_config_profiles().unwrap().len(), 1);
}
