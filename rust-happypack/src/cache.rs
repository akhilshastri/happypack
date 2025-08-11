use crate::{Result, RustHappyPackError, TranspileResponse};
use hex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::fs as async_fs;

pub struct Cache {
    enabled: bool,
    cache_dir: PathBuf,
    memory_cache: HashMap<String, CacheEntry>,
    max_memory_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry {
    response: TranspileResponse,
    timestamp: u64,
    file_hash: String,
}

impl Cache {
    pub fn new(enabled: bool) -> Result<Self> {
        let cache_dir = Self::default_cache_dir()?;

        if enabled {
            fs::create_dir_all(&cache_dir).map_err(|e| {
                RustHappyPackError::cache_error(format!("Failed to create cache directory: {}", e))
            })?;
        }

        Ok(Self {
            enabled,
            cache_dir,
            memory_cache: HashMap::new(),
            max_memory_entries: 1000, // Configurable limit
        })
    }

    pub fn with_cache_dir<P: AsRef<Path>>(enabled: bool, cache_dir: P) -> Result<Self> {
        let cache_dir = cache_dir.as_ref().to_path_buf();

        if enabled {
            fs::create_dir_all(&cache_dir).map_err(|e| {
                RustHappyPackError::cache_error(format!("Failed to create cache directory: {}", e))
            })?;
        }

        Ok(Self {
            enabled,
            cache_dir,
            memory_cache: HashMap::new(),
            max_memory_entries: 1000,
        })
    }

    pub async fn get(&mut self, file_hash: &str) -> Result<Option<TranspileResponse>> {
        if !self.enabled {
            return Ok(None);
        }

        if let Some(entry) = self.memory_cache.get(file_hash) {
            return Ok(Some(entry.response.clone()));
        }

        let cache_file = self.cache_file_path(file_hash);
        if cache_file.exists() {
            match self.load_from_disk(&cache_file).await {
                Ok(entry) => {
                    self.add_to_memory_cache(file_hash.to_string(), entry.clone());
                    Ok(Some(entry.response))
                }
                Err(e) => {
                    tracing::warn!("Failed to load cache entry from disk: {}", e);
                    Ok(None)
                }
            }
        } else {
            Ok(None)
        }
    }

    pub async fn set(&mut self, file_hash: &str, response: &TranspileResponse) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        let entry = CacheEntry {
            response: response.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            file_hash: file_hash.to_string(),
        };

        self.add_to_memory_cache(file_hash.to_string(), entry.clone());

        let cache_file = self.cache_file_path(file_hash);
        self.save_to_disk(&cache_file, &entry).await?;

        Ok(())
    }

    pub async fn clear(&mut self) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        self.memory_cache.clear();

        if self.cache_dir.exists() {
            async_fs::remove_dir_all(&self.cache_dir)
                .await
                .map_err(|e| {
                    RustHappyPackError::cache_error(format!(
                        "Failed to clear cache directory: {}",
                        e
                    ))
                })?;

            async_fs::create_dir_all(&self.cache_dir)
                .await
                .map_err(|e| {
                    RustHappyPackError::cache_error(format!(
                        "Failed to recreate cache directory: {}",
                        e
                    ))
                })?;
        }

        Ok(())
    }

    pub fn stats(&self) -> CacheStats {
        CacheStats {
            enabled: self.enabled,
            memory_entries: self.memory_cache.len(),
            cache_dir: self.cache_dir.clone(),
        }
    }

    pub fn generate_file_hash(content: &str, options: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        hasher.update(options.as_bytes());
        hex::encode(hasher.finalize())
    }

    fn default_cache_dir() -> Result<PathBuf> {
        let cache_dir = if let Some(cache_home) = std::env::var_os("XDG_CACHE_HOME") {
            PathBuf::from(cache_home).join("rust-happypack")
        } else if let Some(home) = std::env::var_os("HOME") {
            PathBuf::from(home).join(".cache").join("rust-happypack")
        } else {
            std::env::temp_dir().join("rust-happypack-cache")
        };

        Ok(cache_dir)
    }

    fn cache_file_path(&self, file_hash: &str) -> PathBuf {
        let subdir = &file_hash[..2.min(file_hash.len())];
        self.cache_dir
            .join(subdir)
            .join(format!("{}.json", file_hash))
    }

    async fn load_from_disk(&self, cache_file: &Path) -> Result<CacheEntry> {
        let content = async_fs::read_to_string(cache_file).await.map_err(|e| {
            RustHappyPackError::cache_error(format!("Failed to read cache file: {}", e))
        })?;

        let entry: CacheEntry = serde_json::from_str(&content).map_err(|e| {
            RustHappyPackError::cache_error(format!("Failed to parse cache entry: {}", e))
        })?;

        Ok(entry)
    }

    async fn save_to_disk(&self, cache_file: &Path, entry: &CacheEntry) -> Result<()> {
        if let Some(parent) = cache_file.parent() {
            async_fs::create_dir_all(parent).await.map_err(|e| {
                RustHappyPackError::cache_error(format!(
                    "Failed to create cache subdirectory: {}",
                    e
                ))
            })?;
        }

        let content = serde_json::to_string_pretty(entry).map_err(|e| {
            RustHappyPackError::cache_error(format!("Failed to serialize cache entry: {}", e))
        })?;

        async_fs::write(cache_file, content).await.map_err(|e| {
            RustHappyPackError::cache_error(format!("Failed to write cache file: {}", e))
        })?;

        Ok(())
    }

    fn add_to_memory_cache(&mut self, file_hash: String, entry: CacheEntry) {
        if self.memory_cache.len() >= self.max_memory_entries {
            if let Some(key) = self.memory_cache.keys().next().cloned() {
                self.memory_cache.remove(&key);
            }
        }

        self.memory_cache.insert(file_hash, entry);
    }
}

#[derive(Debug)]
pub struct CacheStats {
    pub enabled: bool,
    pub memory_entries: usize,
    pub cache_dir: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::TranspileResponse;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_cache_creation() {
        let cache = Cache::new(true);
        assert!(cache.is_ok());

        let cache = Cache::new(false);
        assert!(cache.is_ok());
    }

    #[tokio::test]
    async fn test_cache_with_custom_dir() {
        let temp_dir = TempDir::new().unwrap();
        let cache = Cache::with_cache_dir(true, temp_dir.path());
        assert!(cache.is_ok());
    }

    #[tokio::test]
    async fn test_cache_set_get() {
        let temp_dir = TempDir::new().unwrap();
        let mut cache = Cache::with_cache_dir(true, temp_dir.path()).unwrap();

        let response =
            TranspileResponse::new("test-id".to_string(), "console.log('hello');".to_string());
        let file_hash = "test-hash";

        cache.set(file_hash, &response).await.unwrap();

        let cached = cache.get(file_hash).await.unwrap();
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().code, response.code);
    }

    #[tokio::test]
    async fn test_cache_disabled() {
        let mut cache = Cache::new(false).unwrap();

        let response =
            TranspileResponse::new("test-id".to_string(), "console.log('hello');".to_string());
        let file_hash = "test-hash";

        cache.set(file_hash, &response).await.unwrap();

        let cached = cache.get(file_hash).await.unwrap();
        assert!(cached.is_none());
    }

    #[test]
    fn test_file_hash_generation() {
        let hash1 = Cache::generate_file_hash("console.log('hello');", "{}");
        let hash2 = Cache::generate_file_hash("console.log('hello');", "{}");
        let hash3 = Cache::generate_file_hash("console.log('world');", "{}");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }
}
