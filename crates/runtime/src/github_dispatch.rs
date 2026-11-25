use crate::{Result, github::Github};
use serde_json::json;
use worklens_core::{WorkflowDispatchPayload, WorkflowDispatchResult};

pub async fn dispatch_workflow(
    github: &Github,
    repo_slug: &str,
    payload: &WorkflowDispatchPayload,
) -> Result<WorkflowDispatchResult> {
    let endpoint = format!(
        "/repos/{repo_slug}/actions/workflows/{}/dispatches",
        payload.workflow_id
    );

    let body = json!({
        "ref": payload.ref_name,
        "inputs": payload.inputs,
    });

    github.post(&endpoint, &body).await?;

    Ok(WorkflowDispatchResult {
        success: true,
        workflow_id: payload.workflow_id.clone(),
        ref_name: payload.ref_name.clone(),
        message: format!(
            "Workflow '{}' successfully dispatched for ref '{}'",
            payload.workflow_id, payload.ref_name
        ),
    })
}
