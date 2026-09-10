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
    #[arg(value_parser = ["serve", "mcp", "open", "recent", "trust", "status", "projects", "graph", "tasks", "impact", "pr-impact", "validations", "git", "diff", "documents", "document", "issues", "prs", "pr", "issue", "ci", "run", "logs", "context", "doctor", "agents", "agent", "search", "work"])]
    command: String,
    /// Agent/work action (including context/context-page and decision-*), or path for open.
    argument: Option<String>,
    #[arg(long)]
    repo: Option<String>,
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
    worklens_runtime::transport::ensure(&std::env::current_exe()?).await?;
    if cli.command == "mcp" {
        return mcp::serve().await;
    }
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
    } else {
        cli.command.clone()
    };
    let name = if name == "pr-impact" {
        "pr_impact".into()
    } else {
        name
    };
    let operation: Operation = serde_json::from_value(json!(name))?;
    let mut params: Value = serde_json::from_str(&cli.params)?;
    let object = params
        .as_object_mut()
        .ok_or("--params must be a JSON object")?;
    if cli.refresh {
        object.insert("refresh".into(), json!(true));
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
