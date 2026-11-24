use serde_json::Value;
use std::time::Duration;
use worklens_core::{
    now, ScalewayDatabase, ScalewayK8sCluster, ScalewayLiveReport, ScalewayPrivateNetwork,
    ScalewayServer,
};

const BASE_URL: &str = "https://api.scaleway.com";
const DEFAULT_ZONES: &[&str] = &["fr-par-1", "fr-par-2", "nl-ams-1"];
const DEFAULT_REGIONS: &[&str] = &["fr-par", "nl-ams"];

pub async fn fetch_live_report(
    token: &str,
    auth_source: &str,
    project_id: Option<&str>,
) -> ScalewayLiveReport {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("worklens/0.1.0-alpha.1")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return ScalewayLiveReport {
                connected: false,
                auth_source: auth_source.to_string(),
                project_id: project_id.map(str::to_string),
                error: Some(format!("HTTP client build failed: {e}")),
                fetched_at: now(),
                ..Default::default()
            };
        }
    };

    let mut servers = Vec::new();
    let mut databases = Vec::new();
    let mut k8s_clusters = Vec::new();
    let mut private_networks = Vec::new();
    let mut auth_error = None;

    // 1. Fetch Servers from default zones
    for zone in DEFAULT_ZONES {
        let mut url = format!("{BASE_URL}/instance/v1/zones/{zone}/servers");
        if let Some(pid) = project_id {
            url.push_str(&format!("?project={pid}"));
        }

        match client.get(&url).header("X-Auth-Token", token).send().await {
            Ok(resp) => {
                if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
                    auth_error = Some("Scaleway API Token unauthorized (401)".to_string());
                    break;
                }
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        parse_servers(&json, *zone, &mut servers);
                    }
                }
            }
            Err(_) => {}
        }
    }

    // 2. Fetch Databases from default regions
    if auth_error.is_none() {
        for region in DEFAULT_REGIONS {
            let mut url = format!("{BASE_URL}/rdb/v1/regions/{region}/instances");
            if let Some(pid) = project_id {
                url.push_str(&format!("?project_id={pid}"));
            }

            if let Ok(resp) = client.get(&url).header("X-Auth-Token", token).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        parse_databases(&json, *region, &mut databases);
                    }
                }
            }
        }
    }

    // 3. Fetch K8s Clusters from default regions
    if auth_error.is_none() {
        for region in DEFAULT_REGIONS {
            let mut url = format!("{BASE_URL}/k8s/v1/regions/{region}/clusters");
            if let Some(pid) = project_id {
                url.push_str(&format!("?project_id={pid}"));
            }

            if let Ok(resp) = client.get(&url).header("X-Auth-Token", token).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        parse_k8s_clusters(&json, *region, &mut k8s_clusters);
                    }
                }
            }
        }
    }

    // 4. Fetch VPC Private Networks from default regions
    if auth_error.is_none() {
        for region in DEFAULT_REGIONS {
            let mut url = format!("{BASE_URL}/vpc/v1/regions/{region}/private-networks");
            if let Some(pid) = project_id {
                url.push_str(&format!("?project_id={pid}"));
            }

            if let Ok(resp) = client.get(&url).header("X-Auth-Token", token).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        parse_private_networks(&json, *region, &mut private_networks);
                    }
                }
            }
        }
    }

    ScalewayLiveReport {
        connected: auth_error.is_none(),
        auth_source: auth_source.to_string(),
        project_id: project_id.map(str::to_string),
        servers,
        databases,
        k8s_clusters,
        private_networks,
        error: auth_error,
        fetched_at: now(),
    }
}

fn parse_servers(json: &Value, zone: &str, servers: &mut Vec<ScalewayServer>) {
    if let Some(arr) = json.get("servers").and_then(|s| s.as_array()) {
        for s in arr {
            let id = s
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = s
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let status = s
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let commercial_type = s
                .get("commercial_type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let public_ip = s
                .get("public_ip")
                .and_then(|ip| ip.get("address"))
                .and_then(|a| a.as_str())
                .map(str::to_string);
            let private_ip = s
                .get("private_ip")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let image_name = s
                .get("image")
                .and_then(|img| img.get("name"))
                .and_then(|n| n.as_str())
                .map(str::to_string);

            let tags = s
                .get("tags")
                .and_then(|t| t.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();

            if !id.is_empty() {
                servers.push(ScalewayServer {
                    id,
                    name,
                    status,
                    commercial_type,
                    zone: zone.to_string(),
                    public_ip,
                    private_ip,
                    image_name,
                    tags,
                });
            }
        }
    }
}

fn parse_databases(json: &Value, region: &str, databases: &mut Vec<ScalewayDatabase>) {
    if let Some(arr) = json.get("instances").and_then(|s| s.as_array()) {
        for d in arr {
            let id = d
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = d
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let status = d
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let engine = d
                .get("engine")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let node_type = d
                .get("node_type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let endpoint = d
                .get("endpoints")
                .and_then(|eps| eps.as_array())
                .and_then(|arr| arr.first())
                .map(|ep| {
                    let ip = ep.get("ip").and_then(|v| v.as_str()).unwrap_or("");
                    let port = ep.get("port").and_then(|v| v.as_u64()).unwrap_or(5432);
                    format!("{ip}:{port}")
                });

            if !id.is_empty() {
                databases.push(ScalewayDatabase {
                    id,
                    name,
                    status,
                    engine,
                    node_type,
                    region: region.to_string(),
                    endpoint,
                });
            }
        }
    }
}

fn parse_k8s_clusters(json: &Value, region: &str, clusters: &mut Vec<ScalewayK8sCluster>) {
    if let Some(arr) = json.get("clusters").and_then(|s| s.as_array()) {
        for c in arr {
            let id = c
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = c
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let status = c
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let version = c
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cni = c
                .get("cni")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let node_count = c
                .get("pools")
                .and_then(|p| p.as_array())
                .map(|pools| {
                    pools
                        .iter()
                        .filter_map(|pool| pool.get("size").and_then(|s| s.as_u64()))
                        .sum::<u64>() as u32
                })
                .unwrap_or(0);

            if !id.is_empty() {
                clusters.push(ScalewayK8sCluster {
                    id,
                    name,
                    status,
                    version,
                    cni,
                    region: region.to_string(),
                    node_count,
                });
            }
        }
    }
}

fn parse_private_networks(json: &Value, region: &str, pns: &mut Vec<ScalewayPrivateNetwork>) {
    if let Some(arr) = json.get("private_networks").and_then(|s| s.as_array()) {
        for pn in arr {
            let id = pn
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = pn
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let subnets = pn
                .get("subnets")
                .and_then(|s| s.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();

            if !id.is_empty() {
                pns.push(ScalewayPrivateNetwork {
                    id,
                    name,
                    region: region.to_string(),
                    subnets,
                });
            }
        }
    }
}

#[cfg(test)]
#[path = "scaleway_client.tests.rs"]
mod tests;
