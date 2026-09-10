pub mod agents;
pub mod decision;
pub mod graph;
pub mod model;
pub mod pr_impact;
pub mod protocol;
pub mod work;
pub mod work_context;

pub use agents::*;
pub use decision::*;
pub use graph::*;
pub use model::*;
pub use pr_impact::*;
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
