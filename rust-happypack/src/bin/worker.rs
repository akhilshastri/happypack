use rust_happypack::{Config, Message, RustHappyPack, TranspileRequest, TranspileResponse};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader};
use tracing::{debug, error, info};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting rust-happypack worker");

    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).map(|s| s.as_str()).unwrap_or("stdio");

    match mode {
        "stdio" => run_stdio_mode().await?,
        "message" => run_message_mode().await?,
        _ => {
            eprintln!("Usage: {} [stdio|message]", args[0]);
            std::process::exit(1);
        }
    }

    info!("Worker shutting down");
    Ok(())
}

async fn run_stdio_mode() -> Result<(), Box<dyn std::error::Error>> {
    info!("Running in stdio mode");

    let config = load_config()?;
    let rust_happypack = RustHappyPack::new(config)?;
    rust_happypack.start().await?;

    let stdin = tokio::io::stdin();
    let mut reader = AsyncBufReader::new(stdin);
    let mut stdout = tokio::io::stdout();

    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => {
                debug!("EOF reached, shutting down");
                break;
            }
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                debug!("Received request: {}", trimmed);

                match serde_json::from_str::<TranspileRequest>(trimmed) {
                    Ok(request) => match rust_happypack.transpile(request).await {
                        Ok(response) => {
                            let response_json = serde_json::to_string(&response)?;
                            stdout.write_all(response_json.as_bytes()).await?;
                            stdout.write_all(b"\n").await?;
                            stdout.flush().await?;
                        }
                        Err(e) => {
                            error!("Transpilation error: {}", e);
                            let error_response = create_error_response(&e.to_string());
                            let response_json = serde_json::to_string(&error_response)?;
                            stdout.write_all(response_json.as_bytes()).await?;
                            stdout.write_all(b"\n").await?;
                            stdout.flush().await?;
                        }
                    },
                    Err(e) => {
                        error!("Failed to parse request: {}", e);
                        let error_response =
                            create_error_response(&format!("Invalid request format: {}", e));
                        let response_json = serde_json::to_string(&error_response)?;
                        stdout.write_all(response_json.as_bytes()).await?;
                        stdout.write_all(b"\n").await?;
                        stdout.flush().await?;
                    }
                }
            }
            Err(e) => {
                error!("Error reading from stdin: {}", e);
                break;
            }
        }
    }

    rust_happypack.stop().await?;
    Ok(())
}

async fn run_message_mode() -> Result<(), Box<dyn std::error::Error>> {
    info!("Running in message mode");

    let config = load_config()?;
    let rust_happypack = RustHappyPack::new(config)?;
    rust_happypack.start().await?;

    let stdin = tokio::io::stdin();
    let mut reader = AsyncBufReader::new(stdin);
    let mut stdout = tokio::io::stdout();

    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => {
                debug!("EOF reached, shutting down");
                break;
            }
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                debug!("Received message: {}", trimmed);

                match serde_json::from_str::<Message>(trimmed) {
                    Ok(message) => match handle_message(&rust_happypack, message).await {
                        Ok(Some(response_message)) => {
                            let response_json = serde_json::to_string(&response_message)?;
                            stdout.write_all(response_json.as_bytes()).await?;
                            stdout.write_all(b"\n").await?;
                            stdout.flush().await?;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            error!("Message handling error: {}", e);
                        }
                    },
                    Err(e) => {
                        error!("Failed to parse message: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("Error reading from stdin: {}", e);
                break;
            }
        }
    }

    rust_happypack.stop().await?;
    Ok(())
}

async fn handle_message(
    rust_happypack: &RustHappyPack,
    message: Message,
) -> Result<Option<Message>, Box<dyn std::error::Error>> {
    match message {
        Message::TranspileRequest(request) => match rust_happypack.transpile(request).await {
            Ok(response) => Ok(Some(Message::TranspileResponse(response))),
            Err(e) => {
                let error_response = create_error_response(&e.to_string());
                Ok(Some(Message::TranspileResponse(error_response)))
            }
        },
        Message::Ping => Ok(Some(Message::Pong)),
        Message::Shutdown => {
            info!("Received shutdown message");
            std::process::exit(0);
        }
        _ => {
            debug!("Unhandled message type");
            Ok(None)
        }
    }
}

fn load_config() -> Result<Config, Box<dyn std::error::Error>> {
    let mut config = Config::default();

    if let Ok(threads_str) = std::env::var("RUST_HAPPYPACK_THREADS") {
        config.threads = threads_str.parse()?;
    }

    if let Ok(cache_enabled_str) = std::env::var("RUST_HAPPYPACK_CACHE_ENABLED") {
        config.cache_enabled = cache_enabled_str.parse()?;
    }

    if let Ok(cache_dir) = std::env::var("RUST_HAPPYPACK_CACHE_DIR") {
        config.cache_dir = Some(cache_dir);
    }

    if let Ok(verbose_str) = std::env::var("RUST_HAPPYPACK_VERBOSE") {
        config.verbose = verbose_str.parse()?;
    }

    if let Ok(debug_str) = std::env::var("RUST_HAPPYPACK_DEBUG") {
        config.debug = debug_str.parse()?;
    }

    if let Ok(target) = std::env::var("RUST_HAPPYPACK_TARGET") {
        config.swc_options.target = target;
    }

    if let Ok(source_maps_str) = std::env::var("RUST_HAPPYPACK_SOURCE_MAPS") {
        config.swc_options.source_maps = source_maps_str.parse()?;
    }

    Ok(config)
}

fn create_error_response(error_message: &str) -> TranspileResponse {
    TranspileResponse::new("error".to_string(), String::new())
        .with_warnings(vec![error_message.to_string()])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_config_defaults() {
        let config = load_config().unwrap();
        assert!(config.threads > 0);
        assert_eq!(config.swc_options.target, "es2015");
    }

    #[test]
    fn test_create_error_response() {
        let response = create_error_response("Test error");
        assert_eq!(response.id, "error");
        assert_eq!(response.warnings.len(), 1);
        assert_eq!(response.warnings[0], "Test error");
    }
}
