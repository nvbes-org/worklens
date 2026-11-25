use crate::{error, storage::Store, Result};
use lilia_core::BatchOperation;
use worklens_core::*;

impl Store {
    pub fn work_note(&self, repo: &str, work_id: &str, event_id: &str) -> Result<WorkEvent> {
        let key = format!("{repo}:{work_id}:{event_id}");
        let session = self.db.system();
        let entry = session
            .json_get("work_events", &key)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let entry = entry.ok_or_else(|| error("Selected note not found on this work item"))?;
        let note: WorkEvent = serde_json::from_value(entry.value())?;
        if note.action != "note" || note.details["text"].as_str().is_none() {
            return Err(error("Selected event is not a local note"));
        }
        Ok(note)
    }

    pub fn work_item(&self, repo: &str, id: &str) -> Result<WorkItem> {
        let key = format!("{repo}:{id}");
        let session = self.db.system();
        let entry = session
            .json_get("work_items", &key)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let entry = entry.ok_or_else(|| error("Work item not found in this repository"))?;
        Ok(serde_json::from_value(entry.value())?)
    }

    pub fn work_list(
        &self,
        repo: &str,
        offset: u32,
        state: Option<WorkState>,
        reference: Option<&str>,
    ) -> Result<WorkList> {
        let prefix = format!("{repo}:");
        let session = self.db.system();
        let entries = session
            .json_scan(
                "work_items",
                &lilia_db::Scan::all().prefix(prefix.as_bytes()).limit(1000),
            )
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut items = Vec::new();
        let mut skipped = 0;
        for entry in entries {
            let item: WorkItem = serde_json::from_value(entry.value())?;
            if state.as_ref().is_some_and(|s| s != &item.state)
                || reference.is_some_and(|v| !item.links.iter().any(|l| l.reference == v))
            {
                continue;
            }
            if skipped < offset {
                skipped += 1;
                continue;
            }
            items.push(item);
            if items.len() == 51 {
                break;
            }
        }
        let next_offset = (items.len() > 50).then_some(offset + 50);
        items.truncate(50);
        Ok(WorkList { items, next_offset })
    }

    pub fn work_detail(&self, repo: &str, id: &str, offset: u32) -> Result<WorkDetail> {
        let item = self.work_item(repo, id)?;
        let prefix = format!("{repo}:{id}:");
        let session = self.db.system();
        let entries = session
            .json_scan(
                "work_events",
                &lilia_db::Scan::all().prefix(prefix.as_bytes()).limit(1000),
            )
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut events: Vec<WorkEvent> = Vec::new();
        for entry in entries {
            events.push(serde_json::from_value(entry.value())?);
        }
        events.sort_by(|a, b| b.revision.cmp(&a.revision));
        let total = events.len() as u32;
        let mut selected = Vec::new();
        for ev in events.into_iter().skip(offset as usize).take(51) {
            selected.push(ev);
        }
        let next_offset = (selected.len() > 50).then_some(offset + 50);
        selected.truncate(50);
        let _ = total;
        Ok(WorkDetail {
            item,
            events: selected,
            next_offset,
        })
    }

    pub fn work_replay(&self, repo: &str, mutation: &WorkMutation) -> Result<Option<WorkResult>> {
        let replay_key = format!("{repo}:{}", mutation.event_id);
        let session = self.db.system();
        let entry = session
            .kv_get("work_replays", replay_key.as_bytes())
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        if let Some(entry) = entry {
            let previous = String::from_utf8(entry.value).unwrap_or_default();
            if previous != serde_json::to_string(mutation)? {
                return Err(error("Event ID reused with different content"));
            }
            return Ok(Some(WorkResult {
                applied: false,
                item: self.work_item(repo, &mutation.id)?,
            }));
        }
        Ok(None)
    }

    pub fn change_work(&self, repo: &str, mutation: &WorkMutation) -> Result<WorkResult> {
        if let Some(result) = self.work_replay(repo, mutation)? {
            return Ok(result);
        }
        let item_key = format!("{repo}:{}", mutation.id);
        let session = self.db.system();
        let previous = session
            .json_get("work_items", &item_key)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;

        let now = now();
        let (mut item, expected_version) = match (&mutation.change, previous) {
            (
                WorkChange::Create {
                    title,
                    objective,
                    criteria,
                    links,
                },
                None,
            ) => {
                if mutation.expected_revision != 0 {
                    return Err(error(
                        "Work item already exists or invalid initial revision",
                    ));
                }
                (
                    WorkItem {
                        id: mutation.id.clone(),
                        repository_id: repo.into(),
                        title: title.clone(),
                        objective: objective.clone(),
                        criteria: criteria.clone(),
                        state: WorkState::Todo,
                        revision: 0,
                        links: links.clone(),
                        expectations: vec![],
                        decisions: vec![],
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    },
                    Some(0),
                )
            }
            (WorkChange::Create { .. }, Some(_)) => {
                return Err(error(
                    "Work item already exists or invalid initial revision",
                ));
            }
            (_, Some(entry)) => {
                let mut current: WorkItem = serde_json::from_value(entry.value())?;
                if current.revision != mutation.expected_revision {
                    return Err(error(
                        "Revision conflict: reload the work item before applying your change",
                    ));
                }
                match &mutation.change {
                    WorkChange::DecisionRequest { .. }
                    | WorkChange::DecisionAnswer { .. }
                    | WorkChange::DecisionCancel { .. } => {
                        crate::work_decisions::apply(&mut current, mutation, &now)?;
                    }
                    WorkChange::Expectations { expectations } => {
                        current.expectations = expectations.clone();
                    }
                    WorkChange::Update {
                        title,
                        objective,
                        criteria,
                        state,
                    } => {
                        current.title = title.clone();
                        current.objective = objective.clone();
                        current.criteria = criteria.clone();
                        current.state = state.clone();
                    }
                    WorkChange::Link { link } => {
                        current
                            .links
                            .retain(|l| l.kind != link.kind || l.reference != link.reference);
                        current.links.push(link.clone());
                    }
                    WorkChange::Unlink { kind, reference } => {
                        if !current
                            .links
                            .iter()
                            .any(|l| &l.kind == kind && &l.reference == reference)
                        {
                            return Err(error("Link not found"));
                        }
                        current
                            .links
                            .retain(|l| &l.kind != kind || &l.reference != reference);
                    }
                    WorkChange::Note { .. } => {}
                    WorkChange::Create { .. } => unreachable!(),
                }
                (current, Some(entry.version))
            }
            (_, None) => return Err(error("Work item not found in this repository")),
        };

        if item.links.len() > 100 {
            return Err(error("A work item supports at most 100 links"));
        }
        item.revision = item
            .revision
            .checked_add(1)
            .ok_or_else(|| error("Revision limit reached"))?;
        item.updated_at = now.clone();
        if serde_json::to_vec(&item)?.len() > 128_000 {
            return Err(error("Work item exceeds 128 KB; reduce text or links"));
        }
        let details = serde_json::to_value(&mutation.change)?;
        let event = WorkEvent {
            event_id: mutation.event_id.clone(),
            revision: item.revision,
            action: details["action"].as_str().unwrap_or_default().into(),
            actor: mutation.actor.clone(),
            created_at: now,
            details,
        };

        let event_key = format!(
            "{repo}:{}:{event_id}",
            item.id,
            event_id = mutation.event_id
        );
        let replay_key = format!("{repo}:{}", mutation.event_id);

        let mut ops = vec![
            BatchOperation::JsonPut {
                space: "work_items".into(),
                id: item_key,
                value: serde_json::to_value(&item)?,
                if_version: expected_version,
            },
            BatchOperation::JsonPut {
                space: "work_events".into(),
                id: event_key,
                value: serde_json::to_value(&event)?,
                if_version: None,
            },
            BatchOperation::KvSet {
                namespace: "work_replays".into(),
                key: replay_key.into_bytes(),
                value: serde_json::to_string(mutation)?.into_bytes(),
                if_version: None,
                expires_at_ms: None,
            },
        ];

        // If this is a note, also index into FTS collection "work_notes"
        if let WorkChange::Note { text } = &mutation.change {
            ops.push(BatchOperation::FtsIndex {
                collection: "work_notes".into(),
                doc_id: mutation.event_id.clone(),
                content: text.clone(),
            });
        }

        self.batch(&ops)?;

        Ok(WorkResult {
            applied: true,
            item,
        })
    }
}
