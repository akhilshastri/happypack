use crate::{Config, Result, RustHappyPackError, TranspileRequest, TranspileResponse};
use regex::Regex;
use std::time::Instant;

pub struct Transpiler {
    _config: Config,
    typescript_regex: Regex,
    jsx_regex: Regex,
}

impl Transpiler {
    pub fn new(config: Config) -> Result<Self> {
        let typescript_regex =
            Regex::new(r":\s*\w+(\[\])?(\s*\|\s*\w+)*\s*[;,=)]").map_err(|e| {
                RustHappyPackError::config_error(format!(
                    "Failed to compile TypeScript regex: {}",
                    e
                ))
            })?;

        let jsx_regex = Regex::new(
            r"<[A-Z][a-zA-Z0-9]*[^>]*>.*?</[A-Z][a-zA-Z0-9]*>|<[A-Z][a-zA-Z0-9]*[^>]*/>",
        )
        .map_err(|e| {
            RustHappyPackError::config_error(format!("Failed to compile JSX regex: {}", e))
        })?;

        Ok(Self {
            _config: config,
            typescript_regex,
            jsx_regex,
        })
    }

    pub fn transpile_sync(&self, request: &TranspileRequest) -> Result<TranspileResponse> {
        let start_time = Instant::now();

        let transpiled_code = self.basic_transpile(&request.source_code, &request.file_path)?;

        let processing_time = start_time.elapsed().as_millis() as u64;

        let mut response = TranspileResponse::new(request.id.clone(), transpiled_code)
            .with_processing_time(processing_time);

        if request.source_maps {
            let source_map =
                self.generate_basic_source_map(&request.file_path, &request.source_code);
            response = response.with_source_map(source_map);
        }

        Ok(response)
    }

    fn basic_transpile(&self, source_code: &str, file_path: &str) -> Result<String> {
        let mut code = source_code.to_string();

        let extension = std::path::Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");

        match extension {
            "ts" | "tsx" => {
                code = self.typescript_regex.replace_all(&code, "").to_string();

                if extension == "tsx" {
                    code = self.transform_jsx(&code)?;
                }
            }
            "jsx" => {
                code = self.transform_jsx(&code)?;
            }
            "js" | "mjs" => {}
            _ => {}
        }

        Ok(code)
    }

    fn transform_jsx(&self, code: &str) -> Result<String> {
        let mut transformed = code.to_string();

        transformed = self
            .jsx_regex
            .replace_all(&transformed, |caps: &regex::Captures| {
                let jsx_element = &caps[0];
                format!(
                    "React.createElement('div', null, '{}')",
                    jsx_element.replace("'", "\\'")
                )
            })
            .to_string();

        Ok(transformed)
    }

    fn generate_basic_source_map(&self, file_path: &str, _source_code: &str) -> String {
        serde_json::json!({
            "version": 3,
            "file": file_path,
            "sourceRoot": "",
            "sources": [file_path],
            "names": [],
            "mappings": "AAAA"
        })
        .to_string()
    }

    pub fn get_supported_extensions(&self) -> Vec<&'static str> {
        vec!["js", "jsx", "ts", "tsx", "mjs"]
    }

    pub fn is_supported_file(&self, file_path: &str) -> bool {
        let extension = std::path::Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");

        self.get_supported_extensions().contains(&extension)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::message::TranspileRequest;

    #[test]
    fn test_transpiler_creation() {
        let config = Config::default();
        let transpiler = Transpiler::new(config);
        assert!(transpiler.is_ok());
    }

    #[test]
    fn test_supported_extensions() {
        let config = Config::default();
        let transpiler = Transpiler::new(config).unwrap();

        assert!(transpiler.is_supported_file("test.js"));
        assert!(transpiler.is_supported_file("test.ts"));
        assert!(transpiler.is_supported_file("test.tsx"));
        assert!(transpiler.is_supported_file("test.jsx"));
        assert!(transpiler.is_supported_file("test.mjs"));
        assert!(!transpiler.is_supported_file("test.py"));
    }

    #[test]
    fn test_basic_transpilation() {
        let config = Config::default();
        let transpiler = Transpiler::new(config).unwrap();

        let request = TranspileRequest::new(
            "test-id".to_string(),
            "test.js".to_string(),
            "console.log('hello');".to_string(),
            "test-hash".to_string(),
        );

        let result = transpiler.transpile_sync(&request);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.id, "test-id");
        assert!(!response.code.is_empty());
    }
}
