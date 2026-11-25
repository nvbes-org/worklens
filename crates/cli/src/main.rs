mod mcp;
use clap::Parser;
use serde_json::{Value, json};
use worklens_core::{Operation, PROTOCOL_VERSION, Request};

#[derive(Parser)]
#[command(
    version,
    about = "Local repository and agent observability. All queries use the shared Worklens service."
)]
struct Cli {
    #[arg(value_parser = [
        "serve", "mcp", "watch", "open", "recent", "trust", "status", "projects",
        "graph", "component_metadata", "tasks", "impact", "pr-impact", "validations",
        "git", "diff", "documents", "document", "issues", "prs", "pr", "issue", "ci",
        "run", "logs", "context", "doctor", "agents", "agent", "search", "work",
        "folder-sizes", "folder_sizes", "github", "boundaries",
        "profile", "profiles", "transport", "transports", "permission", "permissions",
        "plugin", "plugins", "engine", "engines"
    ])]
    command: String,
    /// Action or identifier for the command (e.g. start/finish for agent, list/get for plugins).
    argument: Option<String>,
    #[arg(long)]
    repo: Option<String>,
    #[arg(long)]
    pr: Option<u64>,
    /// Additional operation parameters as a JSON object. See docs/cli.md.
    #[arg(long, default_value = "{}")]
    params: String,
    #[arg(long, default_value = "json", value_parser = ["json", "markdown"])]
    format: String,
    #[arg(long)]
    refresh: bool,
}

#[tokio::main]
async fn main() {
    if let Err(error) = execute(Cli::parse()).await {
        eprintln!("worklens: {error}");
        std::process::exit(1);
    }
}

async fn execute(cli: Cli) -> Result<(), Box<dyn std::error::Error>> {
    if cli.command == "serve" {
        worklens_runtime::transport::serve().await?;
        return Ok(());
    }
    if cli.command == "watch" {
        let root = std::path::PathBuf::from(cli.argument.as_deref().unwrap_or("."));
        let canonical = root.canonicalize()?;
        println!(
            "worklens: watching {} for changes (Ctrl+C to stop)...",
            canonical.display()
        );
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let _watcher = worklens_runtime::watcher::watch(&canonical, move |events| {
            for event in events {
                let _ = tx.send(event);
            }
        })?;
        while let Some(event) = rx.recv().await {
            println!(
                "[{:?}] {} ({})",
                event.kind, event.relative_path, event.timestamp
            );
        }
        return Ok(());
    }
    worklens_runtime::transport::ensure(&std::env::current_exe()?).await?;
    if cli.command == "mcp" {
        return mcp::serve().await;
    }

    let mut params: Value = serde_json::from_str(&cli.params)?;
    let object = params
        .as_object_mut()
        .ok_or("--params must be a JSON object")?;

    let name = if cli.command == "agent" {
        let action = cli
            .argument
            .as_deref()
            .ok_or("agent requires start, update, heartbeat or finish")?;
        if !["start", "update", "heartbeat", "finish"].contains(&action) {
            return Err("Invalid agent action".into());
        }
        format!("agent_{action}")
    } else if cli.command == "work" {
        let action = cli.argument.as_deref().ok_or(
            "work requires list, show, context, context-page, create, update, link, unlink, note, expectations, decision-request, decision-answer or decision-cancel",
        )?;
        if ![
            "list",
            "show",
            "context",
            "context-page",
            "create",
            "update",
            "link",
            "unlink",
            "note",
            "expectations",
            "decision-request",
            "decision-answer",
            "decision-cancel",
        ]
        .contains(&action)
        {
            return Err("Invalid work action".into());
        }
        format!("work_{}", action.replace('-', "_"))
    } else if cli.command == "github" {
        let action = cli
            .argument
            .as_deref()
            .ok_or("github requires check, dispatch or comment")?;
        match action {
            "check" => "github_publish_checks".into(),
            "dispatch" => "github_dispatch_workflow".into(),
            "comment" => "github_post_impact_comment".into(),
            _ => return Err("Invalid github action (choose check, dispatch or comment)".into()),
        }
    } else if cli.command == "boundaries" {
        "validate_boundaries".into()
    } else if cli.command == "profile" || cli.command == "profiles" {
        match cli.argument.as_deref() {
            None | Some("list") => "config_profile_list".into(),
            Some("active") => "config_profile_active_get".into(),
            Some("save") => "config_profile_save".into(),
            Some("activate") => "config_profile_activate".into(),
            Some("delete") => "config_profile_delete".into(),
            Some("get") => "config_profile_get".into(),
            Some(id) => {
                object.entry("id").or_insert_with(|| json!(id));
                "config_profile_get".into()
            }
        }
    } else if cli.command == "transport" || cli.command == "transports" {
        match cli.argument.as_deref() {
            None | Some("status") => "transports_status".into(),
            Some("control") | Some("toggle") => "transport_control".into(),
            Some(other) => return Err(format!("Invalid transport action '{other}' (choose status or control)").into()),
        }
    } else if cli.command == "permission" || cli.command == "permissions" {
        match cli.argument.as_deref() {
            None | Some("grants") | Some("list") => "permission_grants_list".into(),
            Some("grant") => "permission_grant_set".into(),
            Some("audit") | Some("logs") => "permission_audit_list".into(),
            Some("check") | Some("eval") => "permission_check".into(),
            Some(other) => return Err(format!("Invalid permission action '{other}' (choose grants, grant, audit, check)").into()),
        }
    } else if cli.command == "plugin" || cli.command == "plugins" {
        match cli.argument.as_deref() {
            None | Some("list") => "plugin_list".into(),
            Some("get") => "plugin_get".into(),
            Some("install") => "plugin_install".into(),
            Some("uninstall") => "plugin_uninstall".into(),
            Some("enable") => "plugin_enable".into(),
            Some("disable") => "plugin_disable".into(),
            Some(id) => {
                object.entry("id").or_insert_with(|| json!(id));
                "plugin_get".into()
            }
        }
    } else if cli.command == "engine" || cli.command == "engines" {
        match cli.argument.as_deref() {
            None | Some("list") => "engines_list".into(),
            Some("exec") | Some("execute") => "engine_execute".into(),
            Some(other) => return Err(format!("Invalid engine action '{other}' (choose list or execute)").into()),
        }
    } else {
        cli.command.clone()
    };
    let name = match name.as_str() {
        "pr-impact" => "pr_impact",
        "folder-sizes" => "folder_sizes",
        other => other,
    };
    let operation: Operation = serde_json::from_value(json!(name))?;
    if cli.refresh {
        object.insert("refresh".into(), json!(true));
    }
    if let Some(pr) = cli.pr {
        object.insert("number".into(), json!(pr));
    }
    if cli.command == "agent" {
        object
            .entry("eventId")
            .or_insert_with(|| json!(uuid::Uuid::new_v4().to_string()));
        if cli.argument.as_deref() == Some("start") {
            object
                .entry("id")
                .or_insert_with(|| json!(uuid::Uuid::new_v4().to_string()));
        }
    }
    let repository = if cli.command == "open" {
        cli.argument.or(cli.repo)
    } else {
        cli.repo
    };
    let repository = repository
        .map(|p| {
            std::path::PathBuf::from(p)
                .canonicalize()
                .map(|p| p.to_string_lossy().into_owned())
        })
        .transpose()?;
    let response = worklens_runtime::transport::send(&Request {
        version: PROTOCOL_VERSION,
        operation,
        repository,
        params,
    })
    .await?;
    if let Some(error) = response.error {
        return Err(error.into());
    }
    if cli.format == "markdown" {
        println!(
            "{}",
            response.data["markdown"]
                .as_str()
                .ok_or("Markdown output is only available for context")?
        );
    } else {
        println!("{}", serde_json::to_string_pretty(&response.data)?);
    }
    Ok(())
}
