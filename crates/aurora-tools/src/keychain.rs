use crate::error::{AuroraError, Result};

pub struct KeychainManager;

impl KeychainManager {
    #[cfg(target_os = "macos")]
    pub fn get_password(service: &str, account: &str) -> Result<Option<String>> {
        use security_framework::os::macos::keychain::SecKeychain;

        let keychain = SecKeychain::default().map_err(|e| AuroraError::Keychain(e.to_string()))?;
        match keychain.find_generic_password(service, account) {
            Ok((pass, _item)) => {
                let s = String::from_utf8(pass.to_vec())
                    .map_err(|e| AuroraError::Keychain(e.to_string()))?;
                Ok(Some(s))
            }
            Err(e) if e.code() == -25300 => {
                // errSecItemNotFound
                Ok(None)
            }
            Err(e) => Err(AuroraError::Keychain(e.to_string())),
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn get_password(_service: &str, _account: &str) -> Result<Option<String>> {
        Ok(None)
    }

    #[cfg(target_os = "macos")]
    pub fn set_password(service: &str, account: &str, password: &str) -> Result<()> {
        use security_framework::os::macos::keychain::SecKeychain;

        let keychain = SecKeychain::default().map_err(|e| AuroraError::Keychain(e.to_string()))?;
        keychain
            .set_generic_password(service, account, password.as_bytes())
            .map_err(|e| AuroraError::Keychain(e.to_string()))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn set_password(_service: &str, _account: &str, _password: &str) -> Result<()> {
        Ok(())
    }

    #[cfg(target_os = "macos")]
    pub fn delete_password(service: &str, account: &str) -> Result<()> {
        use security_framework::os::macos::keychain::SecKeychain;

        let keychain = SecKeychain::default().map_err(|e| AuroraError::Keychain(e.to_string()))?;
        match keychain.find_generic_password(service, account) {
            Ok((_pass, item)) => {
                item.delete();
                Ok(())
            }
            Err(e) if e.code() == -25300 => Ok(()),
            Err(e) => Err(AuroraError::Keychain(e.to_string())),
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn delete_password(_service: &str, _account: &str) -> Result<()> {
        Ok(())
    }
}
