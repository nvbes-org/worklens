use crate::{Result, error, storage::Store};
use rusqlite::{OptionalExtension, params};
use worklens_core::*;

impl Store {
    pub fn work_note(&self, repo: &str, work_id: &str, event_id: &str) -> Result<WorkEvent> {
        let text: Option<String> = self.connection.query_row(
            "SELECT value FROM work_events WHERE repository_id=?1 AND work_id=?2 AND event_id=?3",
            [repo, work_id, event_id], |r| r.get(0),
        ).optional()?;
        let note: WorkEvent = serde_json::from_str(
            &text.ok_or_else(|| error("Selected note not found on this work item"))?,
        )?;
        if note.action != "note" || note.details["text"].as_str().is_none() {
            return Err(error("Selected event is not a local note"));
        }
        Ok(note)
    }

    pub fn work_item(&self, repo: &str, id: &str) -> Result<WorkItem> {
        let text: Option<String> = self
            .connection
            .query_row(
                "SELECT value FROM work_items WHERE repository_id=?1 AND id=?2",
                [repo, id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(serde_json::from_str(&text.ok_or_else(|| {
            error("Work item not found in this repository")
        })?)?)
    }

    pub fn work_list(
        &self,
        repo: &str,
        offset: u32,
        state: Option<WorkState>,
        reference: Option<&str>,
    ) -> Result<WorkList> {
        let mut stmt = self
            .connection
            .prepare("SELECT value FROM work_items WHERE repository_id=? ORDER BY id")?;
        let mut items = Vec::new();
        let mut skipped = 0;
        for row in stmt.query_map([repo], |r| r.get::<_, String>(0))? {
            let item: WorkItem = serde_json::from_str(&row?)?;
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
        let mut stmt = self.connection.prepare("SELECT value FROM work_events WHERE repository_id=?1 AND work_id=?2 ORDER BY revision DESC LIMIT 51 OFFSET ?3")?;
        let mut events: Vec<WorkEvent> = stmt
            .query_map(params![repo, id, offset], |r| r.get::<_, String>(0))?
            .map(|r| Ok(serde_json::from_str(&r?)?))
            .collect::<Result<_>>()?;
        let next_offset = (events.len() > 50).then_some(offset + 50);
        events.truncate(50);
        Ok(WorkDetail {
            item,
            events,
            next_offset,
        })
    }

    pub fn work_replay(&self, repo: &str, mutation: &WorkMutation) -> Result<Option<WorkResult>> {
        let previous: Option<String> = self
            .connection
            .query_row(
                "SELECT payload FROM work_events WHERE repository_id=?1 AND event_id=?2",
                [repo, &mutation.event_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(previous) = previous {
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

    pub fn change_work(&mut self, repo: &str, mutation: &WorkMutation) -> Result<WorkResult> {
        if let Some(result) = self.work_replay(repo, mutation)? {
            return Ok(result);
        }
        let tx = self
            .connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let previous: Option<String> = tx
            .query_row(
                "SELECT value FROM work_items WHERE repository_id=?1 AND id=?2",
                [repo, &mutation.id],
                |r| r.get(0),
            )
            .optional()?;
        let now = now();
        let mut item = if let WorkChange::Create {
            title,
            objective,
            criteria,
            links,
        } = &mutation.change
        {
            if previous.is_some() || mutation.expected_revision != 0 {
                return Err(error(
                    "Work item already exists or invalid initial revision",
                ));
            }
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
            }
        } else {
            let mut item: WorkItem = serde_json::from_str(
                &previous.ok_or_else(|| error("Work item not found in this repository"))?,
            )?;
            if item.revision != mutation.expected_revision {
                return Err(error(
                    "Revision conflict: reload the work item before applying your change",
                ));
            }
            match &mutation.change {
                WorkChange::DecisionRequest { .. }
                | WorkChange::DecisionAnswer { .. }
                | WorkChange::DecisionCancel { .. } => {
                    crate::work_decisions::apply(&mut item, mutation, &now)?
                }
                WorkChange::Expectations { expectations } => {
                    item.expectations = expectations.clone()
                }
                WorkChange::Update {
                    title,
                    objective,
                    criteria,
                    state,
                } => {
                    item.title = title.clone();
                    item.objective = objective.clone();
                    item.criteria = criteria.clone();
                    item.state = state.clone();
                }
                WorkChange::Link { link } => {
                    item.links
                        .retain(|l| l.kind != link.kind || l.reference != link.reference);
                    item.links.push(link.clone());
                }
                WorkChange::Unlink { kind, reference } => {
                    if !item
                        .links
                        .iter()
                        .any(|l| &l.kind == kind && &l.reference == reference)
                    {
                        return Err(error("Link not found"));
                    }
                    item.links
                        .retain(|l| &l.kind != kind || &l.reference != reference);
                }
                WorkChange::Note { .. } => {}
                WorkChange::Create { .. } => unreachable!(),
            }
            item
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
        tx.execute("INSERT INTO work_items VALUES (?1,?2,?3) ON CONFLICT(repository_id,id) DO UPDATE SET value=excluded.value", params![repo, item.id, serde_json::to_string(&item)?])?;
        tx.execute(
            "INSERT INTO work_events VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                repo,
                mutation.event_id,
                item.id,
                item.revision,
                serde_json::to_string(mutation)?,
                serde_json::to_string(&event)?
            ],
        )?;
        tx.commit()?;
        Ok(WorkResult {
            applied: true,
            item,
        })
    }
}
