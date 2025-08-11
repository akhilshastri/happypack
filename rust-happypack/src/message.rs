use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Message {
    TranspileRequest(TranspileRequest),
    TranspileResponse(TranspileResponse),
    WorkerStatus(WorkerStatus),
    Shutdown,
    Ping,
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranspileRequest {
    pub id: String,
    pub file_path: String,
    pub source_code: String,
    pub file_hash: String,
    pub loader_options: HashMap<String, serde_json::Value>,
    pub source_maps: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranspileResponse {
    pub id: String,
    pub code: String,
    pub source_map: Option<String>,
    pub warnings: Vec<String>,
    pub processing_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerStatus {
    pub worker_id: String,
    pub status: WorkerState,
    pub files_processed: u64,
    pub total_processing_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkerState {
    Idle,
    Processing,
    Error(String),
    ShuttingDown,
}

impl TranspileRequest {
    pub fn new(id: String, file_path: String, source_code: String, file_hash: String) -> Self {
        Self {
            id,
            file_path,
            source_code,
            file_hash,
            loader_options: HashMap::new(),
            source_maps: true,
        }
    }

    pub fn with_option(mut self, key: String, value: serde_json::Value) -> Self {
        self.loader_options.insert(key, value);
        self
    }

    pub fn with_source_maps(mut self, source_maps: bool) -> Self {
        self.source_maps = source_maps;
        self
    }
}

impl TranspileResponse {
    pub fn new(id: String, code: String) -> Self {
        Self {
            id,
            code,
            source_map: None,
            warnings: Vec::new(),
            processing_time_ms: 0,
        }
    }

    pub fn with_source_map(mut self, source_map: String) -> Self {
        self.source_map = Some(source_map);
        self
    }

    pub fn with_warnings(mut self, warnings: Vec<String>) -> Self {
        self.warnings = warnings;
        self
    }

    pub fn with_processing_time(mut self, processing_time_ms: u64) -> Self {
        self.processing_time_ms = processing_time_ms;
        self
    }
}
