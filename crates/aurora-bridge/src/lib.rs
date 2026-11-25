pub mod daemon;
pub mod protocol;

pub use daemon::{BridgeDaemon, Session};
pub use protocol::{BridgeRequest, BridgeResponse};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_daemon_lifecycle() {
        let daemon = BridgeDaemon::new();

        // Spawn session
        let resp = daemon.handle_request(BridgeRequest::Spawn {
            shell: Some("/bin/sh".to_string()),
            cwd: None,
            rows: 24,
            cols: 80,
        });

        let session_id = match resp {
            BridgeResponse::Spawned { session_id } => session_id,
            other => panic!("Expected Spawned, got {:?}", other),
        };

        assert_eq!(daemon.session_count(), 1);

        // List sessions
        let list_resp = daemon.handle_request(BridgeRequest::List);
        match list_resp {
            BridgeResponse::Sessions(ids) => {
                assert!(ids.contains(&session_id));
            }
            _ => panic!("Expected Sessions list"),
        }

        // Write command
        let write_resp = daemon.handle_request(BridgeRequest::Write {
            session_id: session_id.clone(),
            data: b"echo 'Hello from AuroraTerm'\n".to_vec(),
        });
        assert!(matches!(write_resp, BridgeResponse::Ok));

        // Kill session
        let kill_resp = daemon.handle_request(BridgeRequest::Kill { session_id });
        assert!(matches!(kill_resp, BridgeResponse::Ok));
        assert_eq!(daemon.session_count(), 0);
    }
}
