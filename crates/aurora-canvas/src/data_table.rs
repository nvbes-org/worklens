use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableColumn {
    pub name: String,
    pub is_numeric: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataTable {
    pub columns: Vec<TableColumn>,
    pub rows: Vec<Vec<String>>,
}

impl DataTable {
    pub fn parse_csv(csv: &str, delimiter: char) -> Self {
        let mut lines = csv.lines();
        let header_line = match lines.next() {
            Some(line) => line,
            None => {
                return Self {
                    columns: Vec::new(),
                    rows: Vec::new(),
                }
            }
        };

        let headers: Vec<&str> = header_line.split(delimiter).map(|s| s.trim()).collect();
        let mut rows = Vec::new();

        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            let row: Vec<String> = line
                .split(delimiter)
                .map(|s| s.trim().to_string())
                .collect();
            rows.push(row);
        }

        let columns = headers
            .iter()
            .enumerate()
            .map(|(idx, &name)| {
                let is_numeric = rows
                    .iter()
                    .all(|r| r.get(idx).map_or(true, |val| val.is_empty() || val.parse::<f64>().is_ok()));
                TableColumn {
                    name: name.to_string(),
                    is_numeric,
                }
            })
            .collect();

        Self { columns, rows }
    }

    pub fn filter_and_sort(
        &self,
        filter_query: Option<&str>,
        sort_column: Option<usize>,
        sort_ascending: bool,
    ) -> Vec<Vec<String>> {
        let mut filtered: Vec<Vec<String>> = if let Some(query) = filter_query {
            let q = query.to_lowercase();
            self.rows
                .iter()
                .filter(|row| row.iter().any(|cell| cell.to_lowercase().contains(&q)))
                .cloned()
                .collect()
        } else {
            self.rows.clone()
        };

        if let Some(col) = sort_column {
            if col < self.columns.len() {
                let is_num = self.columns[col].is_numeric;
                filtered.sort_by(|a, b| {
                    let val_a = a.get(col).map(|s| s.as_str()).unwrap_or("");
                    let val_b = b.get(col).map(|s| s.as_str()).unwrap_or("");
                    if is_num {
                        let na = val_a.parse::<f64>().unwrap_or(0.0);
                        let nb = val_b.parse::<f64>().unwrap_or(0.0);
                        if sort_ascending {
                            na.partial_cmp(&nb).unwrap_or(std::cmp::Ordering::Equal)
                        } else {
                            nb.partial_cmp(&na).unwrap_or(std::cmp::Ordering::Equal)
                        }
                    } else if sort_ascending {
                        val_a.cmp(val_b)
                    } else {
                        val_b.cmp(val_a)
                    }
                });
            }
        }

        filtered
    }
}
