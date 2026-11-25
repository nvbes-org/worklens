use std::collections::HashMap;
use worklens_core::{
    CloudBackend, CloudModule, CloudOutput, CloudProvider, CloudResource, CloudResourceCategory,
    CloudVariable,
};

pub fn infer_provider(type_or_name: &str) -> CloudProvider {
    let s = type_or_name.to_ascii_lowercase();
    if s.starts_with("aws") || s.contains("/aws") {
        CloudProvider::Aws
    } else if s.starts_with("google") || s.contains("/google") || s.starts_with("gcp") {
        CloudProvider::Gcp
    } else if s.starts_with("scaleway") || s.starts_with("scw") || s.contains("/scaleway") {
        CloudProvider::Scaleway
    } else if s.starts_with("azurerm") || s.contains("/azurerm") {
        CloudProvider::Azure
    } else {
        let prefix = s.split('_').next().unwrap_or(&s);
        CloudProvider::Other(prefix.to_string())
    }
}

pub fn infer_category(res_type: &str) -> CloudResourceCategory {
    let t = res_type.to_ascii_lowercase();
    if t.contains("k8s")
        || t.contains("kubernetes")
        || t.contains("cluster")
        || t.contains("container")
        || t.contains("eks")
        || t.contains("gke")
        || t.contains("ecs")
        || t.contains("ecr")
        || t.contains("kapsule")
    {
        CloudResourceCategory::ContainersK8s
    } else if t.contains("instance")
        || t.contains("server")
        || t.contains("vm")
        || t.contains("lambda")
        || t.contains("function")
        || t.contains("cloud_run")
        || t.contains("app_engine")
        || t.contains("compute")
        || t.contains("fargate")
    {
        CloudResourceCategory::Compute
    } else if t.contains("bucket")
        || t.contains("storage")
        || t.contains("disk")
        || t.contains("ebs")
        || t.contains("volume")
        || t.contains("s3")
        || t.contains("object")
    {
        CloudResourceCategory::Storage
    } else if t.contains("db")
        || t.contains("sql")
        || t.contains("rds")
        || t.contains("dynamodb")
        || t.contains("rdb")
        || t.contains("redis")
        || t.contains("bigquery")
        || t.contains("database")
    {
        CloudResourceCategory::Database
    } else if t.contains("vpc")
        || t.contains("subnet")
        || t.contains("route")
        || t.contains("gateway")
        || t.contains("lb")
        || t.contains("load_balancer")
        || t.contains("dns")
        || t.contains("domain")
        || t.contains("network")
        || t.contains("ip")
    {
        CloudResourceCategory::Network
    } else if t.contains("iam")
        || t.contains("role")
        || t.contains("policy")
        || t.contains("secret")
        || t.contains("key")
        || t.contains("kms")
        || t.contains("cert")
        || t.contains("security_group")
        || t.contains("firewall")
    {
        CloudResourceCategory::Security
    } else {
        CloudResourceCategory::Other
    }
}

pub fn infer_environment(path: &str, tags: &HashMap<String, String>) -> Option<String> {
    for (k, v) in tags {
        let key = k.to_ascii_lowercase();
        if key == "env" || key == "environment" || key == "stage" {
            return Some(v.to_ascii_lowercase());
        }
    }
    let lower_path = path.to_ascii_lowercase();
    if lower_path.contains("prod") {
        Some("production".to_string())
    } else if lower_path.contains("stage") || lower_path.contains("staging") {
        Some("staging".to_string())
    } else if lower_path.contains("dev") {
        Some("development".to_string())
    } else if lower_path.contains("test") {
        Some("testing".to_string())
    } else {
        None
    }
}

pub struct ParsedHcl {
    pub resources: Vec<CloudResource>,
    pub modules: Vec<CloudModule>,
    pub variables: Vec<CloudVariable>,
    pub outputs: Vec<CloudOutput>,
    pub backends: Vec<CloudBackend>,
}

pub fn parse_tf_file(rel_path: &str, content: &str) -> ParsedHcl {
    let mut resources = Vec::new();
    let mut modules = Vec::new();
    let mut variables = Vec::new();
    let mut outputs = Vec::new();
    let mut backends = Vec::new();

    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        // 1. Resource: resource "type" "name" {
        if line.starts_with("resource ") && line.contains('{') {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 4 {
                let r_type = parts[1].trim();
                let r_name = parts[3].trim();
                let line_num = (i + 1) as u32;

                let (attrs, tags, deps, next_i) = parse_block_body(&lines, i);
                i = next_i;

                let provider = infer_provider(r_type);
                let category = infer_category(r_type);
                let env = infer_environment(rel_path, &tags);
                let region = attrs.get("region").cloned().or_else(|| attrs.get("zone").cloned());

                resources.push(CloudResource {
                    id: format!("{r_type}.{r_name}"),
                    name: r_name.to_string(),
                    resource_type: r_type.to_string(),
                    provider,
                    category,
                    source_file: rel_path.to_string(),
                    line_number: Some(line_num),
                    region,
                    environment: env,
                    attributes: attrs,
                    tags,
                    dependencies: deps,
                });
                continue;
            }
        }

        // 2. Module: module "name" {
        if line.starts_with("module ") && line.contains('{') {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 2 {
                let m_name = parts[1].trim();
                let line_num = (i + 1) as u32;
                let (attrs, _, _, next_i) = parse_block_body(&lines, i);
                i = next_i;

                let source = attrs.get("source").cloned().unwrap_or_default();
                let version = attrs.get("version").cloned();
                let mut providers = Vec::new();
                let prov = infer_provider(&source);
                if !matches!(prov, CloudProvider::Other(_)) {
                    providers.push(prov);
                }

                modules.push(CloudModule {
                    name: m_name.to_string(),
                    source,
                    version,
                    source_file: rel_path.to_string(),
                    line_number: Some(line_num),
                    providers,
                });
                continue;
            }
        }

        // 3. Variable: variable "name" {
        if line.starts_with("variable ") && line.contains('{') {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 2 {
                let v_name = parts[1].trim();
                let (attrs, _, _, next_i) = parse_block_body(&lines, i);
                i = next_i;

                let var_type = attrs.get("type").cloned();
                let default_value = attrs.get("default").cloned();
                let description = attrs.get("description").cloned();
                let sensitive = attrs.get("sensitive").map(|s| s == "true").unwrap_or(false);

                variables.push(CloudVariable {
                    name: v_name.to_string(),
                    var_type,
                    default_value,
                    description,
                    sensitive,
                    source_file: rel_path.to_string(),
                });
                continue;
            }
        }

        // 4. Output: output "name" {
        if line.starts_with("output ") && line.contains('{') {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 2 {
                let o_name = parts[1].trim();
                let (attrs, _, _, next_i) = parse_block_body(&lines, i);
                i = next_i;

                let description = attrs.get("description").cloned();
                let sensitive = attrs.get("sensitive").map(|s| s == "true").unwrap_or(false);

                outputs.push(CloudOutput {
                    name: o_name.to_string(),
                    description,
                    sensitive,
                    source_file: rel_path.to_string(),
                });
                continue;
            }
        }

        // 5. Backend: backend "s3" { / backend "gcs" {
        if line.starts_with("backend ") && line.contains('{') {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 2 {
                let b_type = parts[1].trim();
                let (attrs, _, _, next_i) = parse_block_body(&lines, i);
                i = next_i;

                let bucket_or_path = attrs.get("bucket").cloned().or_else(|| attrs.get("path").cloned());
                let region = attrs.get("region").cloned();

                backends.push(CloudBackend {
                    backend_type: b_type.to_string(),
                    bucket_or_path,
                    region,
                    source_file: rel_path.to_string(),
                });
                continue;
            }
        }

        i += 1;
    }

    ParsedHcl {
        resources,
        modules,
        variables,
        outputs,
        backends,
    }
}

fn parse_block_body(
    lines: &[&str],
    start_idx: usize,
) -> (
    HashMap<String, String>,
    HashMap<String, String>,
    Vec<String>,
    usize,
) {
    let mut attrs = HashMap::new();
    let mut tags = HashMap::new();
    let mut deps = Vec::new();
    let mut brace_count = 0;
    let mut idx = start_idx;
    let mut in_tags_block = false;

    while idx < lines.len() {
        let line = lines[idx].trim();
        for ch in line.chars() {
            if ch == '{' {
                brace_count += 1;
            } else if ch == '}' {
                brace_count -= 1;
                if in_tags_block && brace_count == 1 {
                    in_tags_block = false;
                }
            }
        }

        if idx > start_idx {
            extract_references(line, &mut deps);

            if line.starts_with("tags") || line.starts_with("labels") {
                if line.contains('{') {
                    in_tags_block = true;
                }
            } else if let Some((k, v)) = line.split_once('=') {
                let key = k.trim().trim_matches('"').to_string();
                let val = v.trim().trim_matches('"').trim_matches(',').to_string();
                if in_tags_block {
                    tags.insert(key, val);
                } else if !key.is_empty() {
                    attrs.insert(key, val);
                }
            }
        }

        if brace_count <= 0 && idx > start_idx {
            break;
        }
        idx += 1;
    }

    (attrs, tags, deps, idx + 1)
}

fn extract_references(line: &str, deps: &mut Vec<String>) {
    for token in line.split(|c: char| c.is_whitespace() || c == '[' || c == ']' || c == ',' || c == '"' || c == '(' || c == ')') {
        let clean = token.trim();
        if clean.contains('.') {
            let parts: Vec<&str> = clean.split('.').collect();
            if parts.len() >= 2 {
                let first = parts[0];
                let second = parts[1];
                if !matches!(first, "var" | "local" | "each" | "count" | "path" | "self" | "data")
                    && !second.is_empty()
                    && (first.contains('_') || first == "module" || first.starts_with("scw") || first.starts_with("aws") || first.starts_with("google"))
                {
                    let dep_id = format!("{first}.{second}");
                    if !deps.contains(&dep_id) {
                        deps.push(dep_id);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "cloud_hcl.tests.rs"]
mod tests;
