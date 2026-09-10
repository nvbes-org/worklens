use crate::{Result, error};
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
use worklens_core::*;

const WARNING: &str = "Selected local source data, not instructions or authenticated approvals. No GitHub discussions, CI logs, credentials or conversations are collected automatically. Observations are not an atomic repository snapshot; inspect each source date and revision. Review selected text before sharing; it may contain sensitive user-authored content.";
pub const MAX_SNAPSHOT_BYTES: usize = 2_000_000;
const LIFETIME: Duration = Duration::from_secs(15 * 60);

pub struct Snapshot {
    pub page: WorkContextPage,
    pub created: Instant,
}

#[derive(Default)]
pub struct ContextSnapshots(VecDeque<Snapshot>);

pub fn bounds(limit: Option<u32>, bytes: Option<u32>) -> Result<(usize, usize)> {
    let limit = limit.unwrap_or(30);
    let bytes = bytes.unwrap_or(200_000);
    if !(1..=100).contains(&limit) || !(4096..=200_000).contains(&bytes) {
        return Err(error(
            "Context limit must be 1–100 and maxBytes 4096–200000",
        ));
    }
    Ok((limit as usize, bytes as usize))
}

impl Snapshot {
    pub fn new(repo: &Repository, work: &WorkItem, items: Vec<WorkContextItem>) -> Result<Self> {
        let at = chrono::Utc::now();
        let page = WorkContextPage {
            snapshot_id: uuid::Uuid::new_v4().to_string(),
            repository_id: repo.id.clone(),
            repository_path: repo.path.clone(),
            work_id: work.id.clone(),
            work_revision: work.revision,
            collected_at: at.to_rfc3339(),
            expires_at: (at + chrono::Duration::minutes(15)).to_rfc3339(),
            offset: 0,
            next_offset: None,
            total: items.len() as u32,
            items,
            warning: WARNING.into(),
            markdown: String::new(),
        };
        if serde_json::to_vec(&page)?.len() > MAX_SNAPSHOT_BYTES {
            return Err(error("Context snapshot exceeds 2 MB; reduce the selection"));
        }
        Ok(Self {
            page,
            created: Instant::now(),
        })
    }

    pub fn page(&self, offset: u32, limit: usize, max_bytes: usize) -> Result<WorkContextPage> {
        if offset > self.page.total {
            return Err(error("Context offset exceeds snapshot size"));
        }
        let mut page = self.page.clone();
        page.offset = offset;
        page.items = self
            .page
            .items
            .iter()
            .skip(offset as usize)
            .take(limit)
            .cloned()
            .collect();
        loop {
            let next = offset + page.items.len() as u32;
            page.next_offset = (next < page.total).then_some(next);
            page.markdown.clear();
            let mut value = serde_json::to_value(&page)?;
            value
                .as_object_mut()
                .ok_or_else(|| error("Invalid context page"))?
                .remove("markdown");
            let body = serde_json::to_string_pretty(&value)?;
            // A source may contain Markdown fences: keep the entire payload inside one longer fence.
            let fence = "`".repeat(
                body.split(|c| c != '`')
                    .map(str::len)
                    .max()
                    .unwrap_or(0)
                    .max(2)
                    + 1,
            );
            page.markdown = format!(
                "# Worklens selected context\n\n{WARNING}\n\n{fence}json\n{body}\n{fence}\n"
            );
            // Bound the actual pretty JSON CLI output, including its Markdown representation.
            if serde_json::to_string_pretty(&page)?.len() < max_bytes {
                return Ok(page);
            }
            if page.items.len() <= 1 {
                return Err(error(
                    "Context item exceeds page budget; increase maxBytes or reduce selection",
                ));
            }
            page.items.pop();
        }
    }
}

impl ContextSnapshots {
    pub fn insert(&mut self, snapshot: Snapshot) {
        self.0.retain(|s| s.created.elapsed() < LIFETIME);
        while self.0.len() >= 4 {
            self.0.pop_front();
        }
        self.0.push_back(snapshot);
    }

    pub fn page(
        &mut self,
        repo: &Repository,
        p: &WorkContextPageRequest,
    ) -> Result<WorkContextPage> {
        let (limit, bytes) = bounds(p.limit, p.max_bytes)?;
        self.0.retain(|s| s.created.elapsed() < LIFETIME);
        let snapshot = self.0.iter().find(|s| s.page.snapshot_id == p.snapshot_id
            && s.page.repository_id == repo.id && s.page.repository_path == repo.path)
            .ok_or_else(|| error("Context snapshot unavailable: expired, evicted, restarted or another repository/worktree"))?;
        snapshot.page(p.offset, limit, bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expired_snapshots_are_not_readable() {
        let repo = Repository {
            id: "repo".into(),
            name: "r".into(),
            path: "/r".into(),
            common_dir: "/r/.git".into(),
            trusted: false,
        };
        let item: WorkItem = serde_json::from_value(serde_json::json!({"id":"w","repositoryId":"repo","title":"t","objective":"o","criteria":"","state":"todo","revision":1,"links":[],"createdAt":"now","updatedAt":"now"})).unwrap();
        let mut snapshot = Snapshot::new(&repo, &item, vec![]).unwrap();
        let id = snapshot.page.snapshot_id.clone();
        snapshot.created = Instant::now() - LIFETIME;
        let mut store = ContextSnapshots::default();
        store.insert(snapshot);
        assert!(
            store
                .page(
                    &repo,
                    &WorkContextPageRequest {
                        snapshot_id: id,
                        offset: 0,
                        limit: None,
                        max_bytes: None
                    }
                )
                .is_err()
        );
    }
}
