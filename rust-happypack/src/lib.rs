pub mod cache;
pub mod config;
pub mod error;
pub mod message;
pub mod thread_pool;
pub mod transpiler;

pub use cache::Cache;
pub use config::Config;
pub use error::{Result, RustHappyPackError};
pub use message::{Message, TranspileRequest, TranspileResponse};
pub use thread_pool::ThreadPool;
pub use transpiler::Transpiler;

use std::sync::Arc;
use tokio::sync::RwLock;

pub struct RustHappyPack {
    config: Config,
    thread_pool: Arc<ThreadPool>,
    cache: Arc<RwLock<Cache>>,
    transpiler: Arc<Transpiler>,
}

impl RustHappyPack {
    pub fn new(config: Config) -> Result<Self> {
        let thread_pool = Arc::new(ThreadPool::new(config.threads)?);
        let cache = Arc::new(RwLock::new(Cache::new(config.cache_enabled)?));
        let transpiler = Arc::new(Transpiler::new(config.clone())?);

        Ok(Self {
            config,
            thread_pool,
            cache,
            transpiler,
        })
    }

    pub async fn transpile(&self, request: TranspileRequest) -> Result<TranspileResponse> {
        let file_hash = Cache::generate_file_hash(
            &request.source_code,
            &serde_json::to_string(&request.loader_options)?,
        );

        if self.config.cache_enabled {
            let mut cache = self.cache.write().await;
            if let Some(cached_result) = cache.get(&file_hash).await? {
                return Ok(cached_result);
            }
        }

        let transpiler = Arc::clone(&self.transpiler);
        let request_clone = request.clone();
        let result = self
            .thread_pool
            .execute(move || transpiler.transpile_sync(&request_clone))
            .await?;

        if self.config.cache_enabled {
            let mut cache = self.cache.write().await;
            cache.set(&file_hash, &result).await?;
        }

        Ok(result)
    }

    pub async fn start(&self) -> Result<()> {
        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rust_happypack_creation() {
        let config = Config::default();
        let rust_happypack = RustHappyPack::new(config);
        assert!(rust_happypack.is_ok());
    }
}
