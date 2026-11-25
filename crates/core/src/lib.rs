pub mod agents;
mod component_metadata;
pub mod decision;
pub mod graph;
pub mod graph_components;
pub mod folder_sizes;
pub use folder_sizes::*;
pub use component_metadata::*;
pub mod model;
pub mod pr_impact;
pub mod protocol;
pub mod boundaries;
pub mod github_checks;
pub mod process_model;
pub mod work;
pub mod work_context;
pub mod cloud_model;
pub mod config_profile;
pub mod permissions;
pub mod plugin_model;
pub use cloud_model::*;
pub use config_profile::*;
pub use permissions::*;
pub use plugin_model::*;
pub use agents::*;
pub use boundaries::*;
pub use decision::*;
pub use github_checks::*;
pub use graph::*;
pub use model::*;
pub use pr_impact::*;
pub use process_model::*;
pub use protocol::*;
pub use work::*;
pub use work_context::*;

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn stable_id(namespace: &str, value: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{namespace}:{:x}", Sha256::digest(value.as_bytes()))
}
mod validation;
pub use validation::*;
