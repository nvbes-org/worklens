use super::*;

#[test]
fn test_parse_servers_json() {
    let raw = serde_json::json!({
        "servers": [
            {
                "id": "1111-2222-3333",
                "name": "prod-api-server",
                "state": "running",
                "commercial_type": "PLAY2-NANO",
                "public_ip": {
                    "address": "51.159.20.30"
                },
                "private_ip": "192.168.1.5",
                "image": {
                    "name": "Ubuntu 22.04"
                },
                "tags": ["production", "web"]
            }
        ]
    });

    let mut servers = Vec::new();
    parse_servers(&raw, "fr-par-1", &mut servers);

    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].id, "1111-2222-3333");
    assert_eq!(servers[0].name, "prod-api-server");
    assert_eq!(servers[0].status, "running");
    assert_eq!(servers[0].commercial_type, "PLAY2-NANO");
    assert_eq!(servers[0].public_ip.as_deref(), Some("51.159.20.30"));
    assert_eq!(servers[0].zone, "fr-par-1");
}

#[test]
fn test_parse_databases_json() {
    let raw = serde_json::json!({
        "instances": [
            {
                "id": "db-1111",
                "name": "app-database",
                "status": "ready",
                "engine": "PostgreSQL-15",
                "node_type": "DB-PLAY2-NANO",
                "endpoints": [
                    {
                        "ip": "51.159.50.60",
                        "port": 5432
                    }
                ]
            }
        ]
    });

    let mut dbs = Vec::new();
    parse_databases(&raw, "fr-par", &mut dbs);

    assert_eq!(dbs.len(), 1);
    assert_eq!(dbs[0].name, "app-database");
    assert_eq!(dbs[0].status, "ready");
    assert_eq!(dbs[0].endpoint.as_deref(), Some("51.159.50.60:5432"));
}
