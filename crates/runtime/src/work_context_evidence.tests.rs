use super::*;
use crate::service::Service;
use std::{
    path::Path,
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use wiremock::{Mock, MockServer, ResponseTemplate, matchers::path};
use worklens_core::*;

const URL: &str = "https://github.com/owner/repo/pull/1";
async fn call(s: &Service, root: &Path, operation: Operation, params: Value) -> Response {
    s.request(Request {
        version: 1,
        operation,
        repository: Some(root.to_string_lossy().into()),
        params,
    })
    .await
}
async fn setup(
    final_status: u16,
    changed: bool,
    checks_status: u16,
) -> (MockServer, tempfile::TempDir, tempfile::TempDir, Service) {
    let server = MockServer::start().await;
    let root = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "-b", "main"])
            .arg(root.path())
            .output()
            .unwrap()
            .status
            .success()
    );
    let mut service = Service::new(&data.path().join("db")).unwrap();
    service.github = Github {
        api_base: server.uri(),
        test_token: Some("fixture-token".into()),
        ..Default::default()
    };
    let opened = call(&service, root.path(), Operation::Open, json!({})).await;
    assert!(opened.error.is_none());
    let created = call(&service, root.path(), Operation::WorkCreate, json!({"id":"w","eventId":"create","actor":"test","expectedRevision":0,"change":{"action":"create","title":"Evidence","objective":"Selected","criteria":"","links":[{"kind":"pr","reference":URL,"status":"confirmed","reason":"test"}]}})).await;
    assert!(created.error.is_none(), "{:?}", created.error);
    assert!(call(&service,root.path(),Operation::WorkExpectations,json!({"id":"w","eventId":"expectations","actor":"test","expectedRevision":1,"change":{"action":"expectations","expectations":[{"repository":"owner/repo","kind":"check","name":"test","appId":42}]}})).await.error.is_none());
    let calls = Arc::new(AtomicUsize::new(0));
    Mock::given(path("/repos/owner/repo/pulls/1")).respond_with(move |_: &wiremock::Request| {
        let last = calls.fetch_add(1, Ordering::SeqCst) >= 2;
        ResponseTemplate::new(if last {final_status} else {200}).set_body_json(json!({"base":{"sha":"a".repeat(40)},"head":{"sha":if last&&changed {"c".repeat(40)}else{"b".repeat(40)},"repo":{"full_name":"fork/repo"}},"changed_files":1}))
    }).mount(&server).await;
    Mock::given(path("/repos/owner/repo/pulls/1/files")).respond_with(ResponseTemplate::new(200).set_body_json(json!([{"filename":"src/lib.rs","status":"renamed","previous_filename":"old.rs","patch":"PRIVATE PATCH"}]))).mount(&server).await;
    Mock::given(path(format!("/repos/owner/repo/commits/{}/check-runs", "b".repeat(40)))).respond_with(ResponseTemplate::new(checks_status).set_body_json(json!({"total_count":1,"check_runs":[{"id":1,"name":"test","head_sha":"b".repeat(40),"status":"completed","conclusion":"success","app":{"id":42}}]}))).mount(&server).await;
    Mock::given(path(format!(
        "/repos/owner/repo/commits/{}/status",
        "b".repeat(40)
    )))
    .respond_with(
        ResponseTemplate::new(200)
            .set_body_json(json!({"sha":"b".repeat(40),"total_count":0,"statuses":[]})),
    )
    .mount(&server)
    .await;
    (server, root, data, service)
}
async fn export(service: &Service, root: &Path, selection: Value) -> Response {
    call(
        service,
        root,
        Operation::WorkContext,
        json!({"id":"w","expectedRevision":2,"selection":selection}),
    )
    .await
}

#[tokio::test]
async fn evidence_is_opt_in_exact_sha_fork_aware_and_paginated() {
    let (server, root, _data, service) = setup(200, false, 200).await;
    let local = export(&service, root.path(), json!({"sections":["summary"]})).await;
    assert!(local.error.is_none());
    assert!(server.received_requests().await.unwrap().is_empty());
    let result = export(&service, root.path(), json!({"prUrls":[URL]})).await;
    assert!(result.error.is_none(), "{:?}", result.error);
    let items = result.data["items"].as_array().unwrap();
    assert_eq!(
        items[0]["data"]["value"]["revision"]["headRepository"],
        "fork/repo"
    );
    assert_eq!(items[1]["data"]["value"]["previousPath"], "old.rs");
    assert!(items.iter().all(|i| i["data"]["sha"] == "b".repeat(40)));
    let impact = items.iter().find(|i| i["kind"] == "pr_impact").unwrap();
    assert_eq!(impact["sources"][0]["status"], "unavailable");
    let assessment = items
        .iter()
        .find(|i| i["kind"] == "pr_expectation")
        .unwrap();
    assert_eq!(assessment["data"]["value"]["outcome"], "success");
    let validations = items
        .iter()
        .find(|i| i["kind"] == "pr_validations")
        .unwrap();
    assert!(
        validations["sources"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["status"] == "available")
    );
    assert!(!result.data.to_string().contains("PRIVATE PATCH"));
    assert!(!result.data.to_string().contains("fixture-token"));
    let count = server.received_requests().await.unwrap().len();
    let page = call(
        &service,
        root.path(),
        Operation::WorkContextPage,
        json!({"snapshotId":result.data["snapshotId"],"offset":1,"limit":1}),
    )
    .await;
    assert_eq!(page.data["items"][0], items[1]);
    assert_eq!(count, server.received_requests().await.unwrap().len());
}

#[tokio::test]
async fn changed_or_unverifiable_final_pr_withholds_only_remote_evidence() {
    for (status, changed) in [(200, true), (401, false)] {
        let (_server, root, _data, service) = setup(status, changed, 200).await;
        let result = export(
            &service,
            root.path(),
            json!({"sections":["summary"],"prUrls":[URL]}),
        )
        .await;
        assert!(result.error.is_none());
        assert_eq!(result.data["items"][0]["kind"], "summary");
        assert_eq!(result.data["items"].as_array().unwrap().len(), 2);
        assert_eq!(
            result.data["items"][1]["sources"][0]["status"],
            "unavailable"
        );
        assert!(result.data["items"][1]["data"].is_null());
    }
}

#[tokio::test]
async fn missing_checks_never_satisfy_the_dossier_expectations() {
    let (_server, root, _data, service) = setup(200, false, 403).await;
    let result = export(&service, root.path(), json!({"prUrls":[URL]})).await;
    assert!(result.error.is_none());
    let summary = result.data["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["kind"] == "pr_validations")
        .unwrap();
    assert_eq!(summary["data"]["value"]["summary"], "unknown");
}

#[tokio::test]
async fn unlinked_unsafe_and_multiple_prs_reject_before_network_access() {
    let (server, root, _data, service) = setup(200, false, 200).await;
    for urls in [
        json!(["https://github.com/owner/repo/pull/2"]),
        json!([URL, URL]),
        json!(["https://evil.test/owner/repo/pull/1"]),
        json!([format!("{URL}?secret=yes")]),
    ] {
        assert!(
            export(&service, root.path(), json!({"prUrls":urls}))
                .await
                .error
                .is_some()
        );
    }
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn candidate_pr_needs_confirmation_before_remote_evidence() {
    let (server, root, _data, service) = setup(200, false, 200).await;
    let changed = call(&service,root.path(),Operation::WorkLink,json!({"id":"w","eventId":"candidate","actor":"test","expectedRevision":2,"change":{"action":"link","link":{"kind":"pr","reference":URL,"status":"candidate","reason":"Needs confirmation"}}})).await;
    assert!(changed.error.is_none());
    let result = call(
        &service,
        root.path(),
        Operation::WorkContext,
        json!({"id":"w","expectedRevision":3,"selection":{"prUrls":[URL]}}),
    )
    .await;
    assert!(result.error.unwrap().contains("confirmed link"));
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn cached_graph_is_approximate_and_export_does_not_execute_workspace_tools() {
    let (_server, root, _data, service) = setup(200, false, 200).await;
    let opened = call(&service, root.path(), Operation::Open, json!({})).await;
    let graph = json!({"nodes":[{"id":"local","name":"local","root":"src","kind":"library","ecosystem":"pnpm","manifest":"package.json","external":false,"targets":[],"features":[]}],"edges":[],"sources":[{"source":"fixture graph","collectedAt":"2026-09-10T10:00:00Z","status":"available","detail":null,"revision":"old"}]});
    let key = format!("graph:{}", opened.data["path"].as_str().unwrap());
    service.db().unwrap().put_cache(&key, &graph).unwrap();
    let result = export(&service, root.path(), json!({"prUrls":[URL]})).await;
    assert!(result.error.is_none());
    let items = result.data["items"].as_array().unwrap();
    let direct = items
        .iter()
        .find(|i| i["kind"] == "pr_impact_direct")
        .unwrap();
    assert_eq!(direct["data"]["value"]["project"]["id"], "local");
    assert_eq!(direct["sources"][0]["status"], "stale");
    let impact = items.iter().find(|i| i["kind"] == "pr_impact").unwrap();
    assert_eq!(impact["data"]["value"]["graphMatchesHead"], false);
    assert_eq!(service.db().unwrap().cache(&key).unwrap().unwrap(), graph);
}
