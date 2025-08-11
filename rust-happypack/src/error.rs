use thiserror::Error;

pub type Result<T> = std::result::Result<T, RustHappyPackError>;

#[derive(Error, Debug)]
pub enum RustHappyPackError {
    #[error("Transpilation error: {0}")]
    TranspilationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Thread pool error: {0}")]
    ThreadPoolError(String),

    #[error("Cache error: {0}")]
    CacheError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Worker communication error: {0}")]
    CommunicationError(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid file format: {0}")]
    InvalidFileFormat(String),
}

impl RustHappyPackError {
    pub fn thread_pool_error(msg: impl Into<String>) -> Self {
        Self::ThreadPoolError(msg.into())
    }

    pub fn cache_error(msg: impl Into<String>) -> Self {
        Self::CacheError(msg.into())
    }

    pub fn config_error(msg: impl Into<String>) -> Self {
        Self::ConfigError(msg.into())
    }

    pub fn transpilation_error(msg: impl Into<String>) -> Self {
        Self::TranspilationError(msg.into())
    }

    pub fn communication_error(msg: impl Into<String>) -> Self {
        Self::CommunicationError(msg.into())
    }
}
