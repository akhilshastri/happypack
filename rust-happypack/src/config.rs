use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub threads: usize,
    pub cache_enabled: bool,
    pub cache_dir: Option<String>,
    pub verbose: bool,
    pub debug: bool,
    pub swc_options: SwcOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwcOptions {
    pub target: String,
    pub source_maps: bool,
    pub jsx: Option<JsxConfig>,
    pub typescript: Option<TypeScriptConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsxConfig {
    pub pragma: String,
    pub pragma_frag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeScriptConfig {
    pub strip_only: bool,
    pub decorators: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            threads: num_cpus::get().min(4),
            cache_enabled: true,
            cache_dir: None,
            verbose: false,
            debug: false,
            swc_options: SwcOptions::default(),
        }
    }
}

impl Default for SwcOptions {
    fn default() -> Self {
        Self {
            target: "es2015".to_string(),
            source_maps: true,
            jsx: Some(JsxConfig::default()),
            typescript: Some(TypeScriptConfig::default()),
        }
    }
}

impl Default for JsxConfig {
    fn default() -> Self {
        Self {
            pragma: "React.createElement".to_string(),
            pragma_frag: "React.Fragment".to_string(),
        }
    }
}

impl Default for TypeScriptConfig {
    fn default() -> Self {
        Self {
            strip_only: false,
            decorators: true,
        }
    }
}
