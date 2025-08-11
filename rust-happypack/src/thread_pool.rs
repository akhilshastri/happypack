use crate::{Result, RustHappyPackError};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;
use tracing::{debug, error, info};

pub struct ThreadPool {
    workers: Vec<Worker>,
    sender: mpsc::UnboundedSender<WorkerMessage>,
    receiver: Arc<Mutex<mpsc::UnboundedReceiver<WorkerMessage>>>,
    active_tasks: Arc<Mutex<HashMap<String, oneshot::Sender<Result<String>>>>>,
    size: usize,
    running: Arc<Mutex<bool>>,
}

enum WorkerMessage {
    Execute {
        id: String,
        task: Box<dyn FnOnce() -> Result<String> + Send + 'static>,
        response_tx: oneshot::Sender<Result<String>>,
    },
    Shutdown,
}

struct Worker {
    id: usize,
    handle: Option<JoinHandle<()>>,
}

impl ThreadPool {
    pub fn new(size: usize) -> Result<Self> {
        if size == 0 {
            return Err(RustHappyPackError::thread_pool_error(
                "Thread pool size must be greater than 0",
            ));
        }

        let (sender, receiver) = mpsc::unbounded_channel();
        let receiver = Arc::new(Mutex::new(receiver));
        let active_tasks = Arc::new(Mutex::new(HashMap::new()));
        let running = Arc::new(Mutex::new(false));

        let workers = Vec::with_capacity(size);

        Ok(Self {
            workers,
            sender,
            receiver,
            active_tasks,
            size,
            running,
        })
    }

    pub async fn start(&mut self) -> Result<()> {
        let mut running = self.running.lock().await;
        if *running {
            return Ok(());
        }

        info!("Starting thread pool with {} workers", self.size);

        for id in 0..self.size {
            let receiver = Arc::clone(&self.receiver);

            let handle = tokio::spawn(async move {
                Self::worker_loop(id, receiver).await;
            });

            self.workers.push(Worker {
                id,
                handle: Some(handle),
            });
        }

        *running = true;
        info!("Thread pool started successfully");
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<()> {
        let mut running = self.running.lock().await;
        if !*running {
            return Ok(());
        }

        info!("Stopping thread pool");

        for _ in 0..self.size {
            if let Err(e) = self.sender.send(WorkerMessage::Shutdown) {
                error!("Failed to send shutdown message: {}", e);
            }
        }

        for worker in &mut self.workers {
            if let Some(handle) = worker.handle.take() {
                if let Err(e) = handle.await {
                    error!("Worker {} failed to shutdown cleanly: {}", worker.id, e);
                }
            }
        }

        self.workers.clear();
        *running = false;
        info!("Thread pool stopped");
        Ok(())
    }

    pub async fn execute<F, T>(&self, task: F) -> Result<T>
    where
        F: FnOnce() -> Result<T> + Send + 'static,
        T: Send + 'static + serde::Serialize + for<'de> serde::Deserialize<'de>,
    {
        let running = self.running.lock().await;
        if !*running {
            return Err(RustHappyPackError::thread_pool_error(
                "Thread pool is not running",
            ));
        }
        drop(running);

        let task_id = uuid::Uuid::new_v4().to_string();
        let (response_tx, _response_rx) = oneshot::channel();

        {
            let mut active_tasks = self.active_tasks.lock().await;
            active_tasks.insert(task_id.clone(), response_tx);
        }

        let wrapped_task = Box::new(move || {
            let result = task();
            match result {
                Ok(value) => match serde_json::to_string(&value) {
                    Ok(serialized) => Ok(serialized),
                    Err(e) => Err(RustHappyPackError::JsonError(e)),
                },
                Err(e) => Err(e),
            }
        });

        let (task_response_tx, task_response_rx) = oneshot::channel();
        let message = WorkerMessage::Execute {
            id: task_id.clone(),
            task: wrapped_task,
            response_tx: task_response_tx,
        };

        if self.sender.send(message).is_err() {
            let mut active_tasks = self.active_tasks.lock().await;
            active_tasks.remove(&task_id);
            return Err(RustHappyPackError::thread_pool_error(
                "Failed to send task to worker",
            ));
        }

        match task_response_rx.await {
            Ok(result) => {
                let mut active_tasks = self.active_tasks.lock().await;
                active_tasks.remove(&task_id);

                match result {
                    Ok(serialized_result) => match serde_json::from_str(&serialized_result) {
                        Ok(value) => Ok(value),
                        Err(e) => Err(RustHappyPackError::JsonError(e)),
                    },
                    Err(e) => Err(e),
                }
            }
            Err(_) => {
                let mut active_tasks = self.active_tasks.lock().await;
                active_tasks.remove(&task_id);
                Err(RustHappyPackError::thread_pool_error(
                    "Worker task was cancelled",
                ))
            }
        }
    }

    async fn worker_loop(
        worker_id: usize,
        receiver: Arc<Mutex<mpsc::UnboundedReceiver<WorkerMessage>>>,
    ) {
        debug!("Worker {} started", worker_id);

        loop {
            let message = {
                let mut receiver = receiver.lock().await;
                receiver.recv().await
            };

            match message {
                Some(WorkerMessage::Execute {
                    id,
                    task,
                    response_tx,
                }) => {
                    debug!("Worker {} executing task {}", worker_id, id);

                    let result = tokio::task::spawn_blocking(task).await;

                    let task_result = match result {
                        Ok(task_result) => task_result,
                        Err(e) => Err(RustHappyPackError::thread_pool_error(format!(
                            "Task execution failed: {}",
                            e
                        ))),
                    };

                    if response_tx.send(task_result).is_err() {
                        error!(
                            "Worker {} failed to send response for task {}",
                            worker_id, id
                        );
                    }
                }
                Some(WorkerMessage::Shutdown) => {
                    debug!("Worker {} received shutdown signal", worker_id);
                    break;
                }
                None => {
                    debug!("Worker {} channel closed", worker_id);
                    break;
                }
            }
        }

        debug!("Worker {} stopped", worker_id);
    }

    pub fn size(&self) -> usize {
        self.size
    }

    pub async fn is_running(&self) -> bool {
        let running = self.running.lock().await;
        *running
    }
}

impl Drop for ThreadPool {
    fn drop(&mut self) {
        for _ in 0..self.size {
            let _ = self.sender.send(WorkerMessage::Shutdown);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // use tokio::time::{sleep, Duration}; // Will be used for future timeout functionality

    #[tokio::test]
    async fn test_thread_pool_creation() {
        let pool = ThreadPool::new(4);
        assert!(pool.is_ok());

        let pool = ThreadPool::new(0);
        assert!(pool.is_err());
    }

    #[tokio::test]
    async fn test_thread_pool_start_stop() {
        let mut pool = ThreadPool::new(2).unwrap();

        assert!(!pool.is_running().await);

        pool.start().await.unwrap();
        assert!(pool.is_running().await);

        pool.stop().await.unwrap();
        assert!(!pool.is_running().await);
    }

    #[tokio::test]
    async fn test_task_execution() {
        let mut pool = ThreadPool::new(2).unwrap();
        pool.start().await.unwrap();

        let result: Result<i32> = pool.execute(|| Ok(42)).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);

        pool.stop().await.unwrap();
    }
}
