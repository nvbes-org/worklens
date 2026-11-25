use crate::protocol::{BridgeRequest, BridgeResponse};
use aurora_blocks::BlockCollector;
use aurora_core::{AnsiParser, NativePty, PtySize, TerminalGrid};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct Session {
    pub pty: NativePty,
    pub grid: TerminalGrid,
    pub parser: AnsiParser,
    pub collector: BlockCollector,
}

pub struct BridgeDaemon {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl Default for BridgeDaemon {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl BridgeDaemon {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn handle_request(&self, req: BridgeRequest) -> BridgeResponse {
        match req {
            BridgeRequest::Spawn {
                shell,
                cwd,
                rows,
                cols,
            } => {
                let size = PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                };
                let shell_ref = shell.as_deref();
                let cwd_ref = cwd.as_deref();

                match NativePty::spawn(shell_ref, &[], cwd_ref, size, &[]) {
                    Ok(pty) => {
                        let session_id = format!("sess_{}", Uuid::new_v4().simple());
                        let session = Session {
                            pty,
                            grid: TerminalGrid::new(rows as usize, cols as usize, 1000),
                            parser: AnsiParser::new(),
                            collector: BlockCollector::new(),
                        };
                        let mut lock = self.sessions.lock().unwrap();
                        lock.insert(session_id.clone(), session);
                        BridgeResponse::Spawned { session_id }
                    }
                    Err(e) => BridgeResponse::Error(e.to_string()),
                }
            }
            BridgeRequest::Write { session_id, data } => {
                let mut lock = self.sessions.lock().unwrap();
                if let Some(session) = lock.get_mut(&session_id) {
                    if let Err(e) = session.pty.write_all(&data) {
                        return BridgeResponse::Error(e.to_string());
                    }
                    BridgeResponse::Ok
                } else {
                    BridgeResponse::Error("Session not found".to_string())
                }
            }
            BridgeRequest::Resize {
                session_id,
                rows,
                cols,
            } => {
                let mut lock = self.sessions.lock().unwrap();
                if let Some(session) = lock.get_mut(&session_id) {
                    let size = PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    };
                    if let Err(e) = session.pty.resize(size) {
                        return BridgeResponse::Error(e.to_string());
                    }
                    session.grid.resize(rows as usize, cols as usize);
                    BridgeResponse::Ok
                } else {
                    BridgeResponse::Error("Session not found".to_string())
                }
            }
            BridgeRequest::Kill { session_id } => {
                let mut lock = self.sessions.lock().unwrap();
                if lock.remove(&session_id).is_some() {
                    BridgeResponse::Ok
                } else {
                    BridgeResponse::Error("Session not found".to_string())
                }
            }
            BridgeRequest::List => {
                let lock = self.sessions.lock().unwrap();
                let ids: Vec<String> = lock.keys().cloned().collect();
                BridgeResponse::Sessions(ids)
            }
            BridgeRequest::GetBlocks { session_id } => {
                let lock = self.sessions.lock().unwrap();
                if let Some(session) = lock.get(&session_id) {
                    BridgeResponse::Blocks(session.collector.blocks().to_vec())
                } else {
                    BridgeResponse::Error("Session not found".to_string())
                }
            }
        }
    }

    pub fn read_session_output(&self, session_id: &str, buf: &mut [u8]) -> std::io::Result<usize> {
        let mut lock = self.sessions.lock().unwrap();
        if let Some(session) = lock.get_mut(session_id) {
            match session.pty.read(buf) {
                Ok(n) => {
                    if n > 0 {
                        let osc_events = session.parser.process_bytes(&mut session.grid, &buf[..n]);
                        for ev in &osc_events {
                            session.collector.handle_osc_event(ev);
                        }
                    }
                    Ok(n)
                }
                Err(e) => Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())),
            }
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Session not found",
            ))
        }
    }

    pub fn session_count(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }
}
