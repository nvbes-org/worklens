use serde_json::json;
use std::fs;
use tempfile::tempdir;
use worklens_core::FolderSizeReport;
use worklens_runtime::folder_sizes::scan;

#[tokio::test]
async fn test_folder_sizes_scan_hierarchy_and_totals() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path();

    // Create directory hierarchy
    let sub1 = root.join("src");
    let sub2 = root.join("docs");
    let nested = sub1.join("components");
    fs::create_dir_all(&nested).expect("create_dir");
    fs::create_dir_all(&sub2).expect("create_dir");

    // Create files with known sizes
    fs::write(root.join("README.md"), vec![b'a'; 100]).expect("write");
    fs::write(sub1.join("main.rs"), vec![b'b'; 500]).expect("write");
    fs::write(nested.join("button.rs"), vec![b'c'; 1200]).expect("write");
    fs::write(sub2.join("guide.md"), vec![b'd'; 300]).expect("write");

    let params = json!({
        "subpath": "",
        "maxDepth": 4,
        "includeHidden": true
    });

    let val = scan(root, &params).await.expect("scan success");
    let report: FolderSizeReport = serde_json::from_value(val).expect("deserialize report");

    assert_eq!(report.total_bytes, 100 + 500 + 1200 + 300);
    assert_eq!(report.total_files, 4);
    assert_eq!(report.total_dirs, 3); // src, components, docs
    assert_eq!(report.top_largest_files.len(), 4);
    assert_eq!(report.top_largest_files[0].name, "button.rs");
    assert_eq!(report.top_largest_files[0].size_bytes, 1200);

    // Tree checks
    let tree = report.tree;
    assert_eq!(tree.size_bytes, 2100);
    assert!(tree.children.is_some());
    let children = tree.children.unwrap();
    // src should be larger than docs and README.md
    assert_eq!(children[0].name, "src");
    assert_eq!(children[0].size_bytes, 1700);
}
