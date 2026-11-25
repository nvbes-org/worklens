pub mod apple_container;
pub mod cargo;
pub mod devcontainer;
pub mod docker;
pub mod gh;
pub mod git;
pub mod iac;
pub mod kubernetes;
pub mod npm;
pub mod nx;
pub mod oci;
pub mod pnpm;
pub mod scw;
pub mod yarn;

use std::sync::Arc;
use crate::engines::registry::EngineRegistry;

pub fn register_all(registry: &EngineRegistry) {
    registry.register(Arc::new(pnpm::PnpmEngine));
    registry.register(Arc::new(npm::NpmEngine));
    registry.register(Arc::new(yarn::YarnEngine));
    registry.register(Arc::new(cargo::CargoEngine));
    registry.register(Arc::new(nx::NxEngine));
    registry.register(Arc::new(iac::IacEngine));
    registry.register(Arc::new(git::GitEngine));
    registry.register(Arc::new(scw::ScwEngine));
    registry.register(Arc::new(gh::GhEngine));
    registry.register(Arc::new(docker::DockerEngine));
    registry.register(Arc::new(oci::OciEngine));
    registry.register(Arc::new(apple_container::AppleContainerEngine));
    registry.register(Arc::new(kubernetes::KubernetesEngine));
    registry.register(Arc::new(devcontainer::DevcontainerEngine));
}
