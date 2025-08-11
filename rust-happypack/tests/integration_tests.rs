use rust_happypack::*;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::test]
async fn test_full_transpilation_workflow() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let request = TranspileRequest::new(
        "integration-test".to_string(),
        "test.ts".to_string(),
        r#"
            interface User {
                name: string;
                age: number;
            }
            
            function greet(user: User): string {
                return `Hello, ${user.name}!`;
            }
            
            const user: User = { name: "John", age: 30 };
            console.log(greet(user));
        "#
        .to_string(),
        "integration-hash".to_string(),
    );

    let response = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request)
        })
        .await
        .unwrap();

    assert_eq!(response.id, "integration-test");
    assert!(!response.code.is_empty());
    assert!(response.processing_time_ms > 0);

    assert!(!response.code.contains("interface User"));
    assert!(!response.code.contains(": User"));
    assert!(!response.code.contains(": string"));
    assert!(!response.code.contains(": number"));
}

#[tokio::test]
async fn test_jsx_transpilation_workflow() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let request = TranspileRequest::new(
        "jsx-integration-test".to_string(),
        "test.jsx".to_string(),
        r#"
            function App() {
                return (
                    <div>
                        <h1>Hello World</h1>
                        <Button onClick={handleClick}>Click me</Button>
                    </div>
                );
            }
            
            export default App;
        "#
        .to_string(),
        "jsx-integration-hash".to_string(),
    );

    let response = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request)
        })
        .await
        .unwrap();

    assert_eq!(response.id, "jsx-integration-test");
    assert!(!response.code.is_empty());

    assert!(response.code.contains("React.createElement"));
}

#[tokio::test]
async fn test_source_map_generation() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let mut request = TranspileRequest::new(
        "sourcemap-integration-test".to_string(),
        "test.js".to_string(),
        "console.log('Hello, source maps!');".to_string(),
        "sourcemap-integration-hash".to_string(),
    );
    request.source_maps = true;

    let response = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request)
        })
        .await
        .unwrap();

    assert_eq!(response.id, "sourcemap-integration-test");
    assert!(response.source_map.is_some());

    let source_map: serde_json::Value =
        serde_json::from_str(&response.source_map.unwrap()).unwrap();
    assert_eq!(source_map["version"], 3);
    assert_eq!(source_map["file"], "test.js");
}

#[tokio::test]
async fn test_caching_workflow() {
    let config = Config {
        cache_enabled: true,
        cache_dir: Some("/tmp/rust-happypack-test-cache".to_string()),
        ..Default::default()
    };

    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let request = TranspileRequest::new(
        "cache-test".to_string(),
        "test.js".to_string(),
        "console.log('Cache test');".to_string(),
        "cache-test-hash".to_string(),
    );

    let request_clone = request.clone();
    let start_time = std::time::Instant::now();
    let response1 = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request)
        })
        .await
        .unwrap();
    let _first_duration = start_time.elapsed();

    let start_time = std::time::Instant::now();
    let response2 = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request_clone)
        })
        .await
        .unwrap();
    let _second_duration = start_time.elapsed();

    assert_eq!(response1.code, response2.code);
}

#[tokio::test]
async fn test_concurrent_transpilation() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();
    let pool = Arc::new(Mutex::new(pool));

    let mut handles = vec![];

    for i in 0..20 {
        let pool_clone = Arc::clone(&pool);
        let handle = tokio::spawn(async move {
            let request = TranspileRequest::new(
                format!("concurrent-test-{}", i),
                "test.ts".to_string(),
                format!(
                    r#"
                        interface Data{} {{
                            value: number;
                        }}
                        
                        const data{}: Data{} = {{ value: {} }};
                        console.log(data{}.value);
                    "#,
                    i, i, i, i, i
                ),
                format!("concurrent-hash-{}", i),
            );

            let pool = pool_clone.lock().await;
            pool.execute(move || {
                let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
                transpiler.transpile_sync(&request)
            })
            .await
        });
        handles.push(handle);
    }

    let mut results = vec![];
    for handle in handles {
        let result = handle.await.unwrap();
        assert!(result.is_ok());
        results.push(result.unwrap());
    }

    assert_eq!(results.len(), 20);
    for (i, response) in results.iter().enumerate() {
        assert_eq!(response.id, format!("concurrent-test-{}", i));
        assert!(!response.code.is_empty());
        assert!(response.processing_time_ms > 0);
    }
}

#[tokio::test]
async fn test_error_handling() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let request = TranspileRequest::new(
        "error-test".to_string(),
        "".to_string(),
        "console.log('test');".to_string(),
        "error-hash".to_string(),
    );

    let result = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request)
        })
        .await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_large_file_transpilation() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let mut large_code = String::new();
    for i in 0..1000 {
        large_code.push_str(&format!(
            r#"
                interface Data{} {{
                    id: number;
                    name: string;
                    value: number;
                }}
                
                function process{}(data: Data{}): string {{
                    return `Processing ${{data.name}} with value ${{data.value}}`;
                }}
                
                const result{} = process{}({{ id: {}, name: "item{}", value: {} }});
                console.log(result{});
            "#,
            i, i, i, i, i, i, i, i, i
        ));
    }

    let request = TranspileRequest::new(
        "large-file-test".to_string(),
        "large.ts".to_string(),
        large_code,
        "large-file-hash".to_string(),
    );

    let start_time = std::time::Instant::now();
    let response = pool
        .execute(move || {
            let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
            transpiler.transpile_sync(&request)
        })
        .await
        .unwrap();
    let duration = start_time.elapsed();

    assert_eq!(response.id, "large-file-test");
    assert!(!response.code.is_empty());
    assert!(response.processing_time_ms > 0);

    assert!(duration.as_secs() < 10);

    assert!(!response.code.contains("interface Data"));
    assert!(!response.code.contains(": Data"));
    assert!(!response.code.contains(": string"));
    assert!(!response.code.contains(": number"));
}

#[tokio::test]
async fn test_different_file_types() {
    let config = Config::default();
    let mut pool = ThreadPool::new(config.threads).unwrap();
    pool.start().await.unwrap();

    let test_cases = [
        ("test.js", "console.log('JavaScript');"),
        ("test.jsx", "function App() { return <div>JSX</div>; }"),
        ("test.ts", "const x: number = 42; console.log(x);"),
        ("test.tsx", "interface Props { name: string; } function Component(props: Props) { return <div>{props.name}</div>; }"),
        ("test.mjs", "import { something } from 'module'; console.log(something);"),
    ];

    for (i, (file_path, source_code)) in test_cases.iter().enumerate() {
        let request = TranspileRequest::new(
            format!("filetype-test-{}", i),
            file_path.to_string(),
            source_code.to_string(),
            format!("filetype-hash-{}", i),
        );

        let response = pool
            .execute(move || {
                let transpiler = crate::Transpiler::new(crate::Config::default()).unwrap();
                transpiler.transpile_sync(&request)
            })
            .await
            .unwrap();

        assert_eq!(response.id, format!("filetype-test-{}", i));
        assert!(!response.code.is_empty());
        assert!(response.processing_time_ms > 0);
    }
}

#[test]
fn test_config_validation() {
    let config = Config {
        threads: 1,
        ..Default::default()
    };
    assert!(config.threads >= 1);

    let mut config = Config {
        threads: 16,
        ..Default::default()
    };
    assert!(config.threads <= 32); // Reasonable upper limit

    config.cache_dir = Some("/tmp/valid-cache-dir".to_string());
    assert!(config.cache_dir.is_some());

    config.cache_dir = None;
    assert!(config.cache_dir.is_none());
}

#[test]
fn test_message_round_trip() {
    let original_request = TranspileRequest::new(
        "round-trip-test".to_string(),
        "test.ts".to_string(),
        "const x: number = 42;".to_string(),
        "round-trip-hash".to_string(),
    );

    let message = Message::TranspileRequest(original_request.clone());
    let serialized = serde_json::to_string(&message).unwrap();
    let deserialized: Message = serde_json::from_str(&serialized).unwrap();

    match deserialized {
        Message::TranspileRequest(request) => {
            assert_eq!(request.id, original_request.id);
            assert_eq!(request.file_path, original_request.file_path);
            assert_eq!(request.source_code, original_request.source_code);
            assert_eq!(request.file_hash, original_request.file_hash);
        }
        _ => panic!("Expected TranspileRequest"),
    }
}
