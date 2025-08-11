interface DataPoint {
  id: number;
  value: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

interface ProcessingResult {
  processed: DataPoint[];
  statistics: {
    count: number;
    average: number;
    min: number;
    max: number;
  };
}

class DataProcessor<T extends DataPoint> {
  private data: T[] = [];
  private processingQueue: Promise<void>[] = [];

  constructor(private batchSize: number = 100) {
    console.log(`DataProcessor initialized with batch size: ${batchSize}`);
    console.log('This file is being transpiled by Rust HappyPack!');
  }

  async addData(items: T[]): Promise<void> {
    this.data.push(...items);
    
    if (this.data.length >= this.batchSize) {
      const batch = this.data.splice(0, this.batchSize);
      const processingPromise = this.processBatch(batch);
      this.processingQueue.push(processingPromise);
    }
  }

  private async processBatch(batch: T[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    const processed = batch.map(item => ({
      ...item,
      value: item.value * 2,
      metadata: {
        ...item.metadata,
        processed: true,
        processingTime: Date.now()
      }
    }));

    console.log(`Processed batch of ${processed.length} items`);
  }

  async processAll(): Promise<ProcessingResult> {
    if (this.data.length > 0) {
      await this.processBatch([...this.data]);
      this.data = [];
    }

    await Promise.all(this.processingQueue);
    this.processingQueue = [];

    const allData = this.getAllProcessedData();
    const values = allData.map(item => item.value);
    
    return {
      processed: allData,
      statistics: {
        count: values.length,
        average: values.reduce((sum, val) => sum + val, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      }
    };
  }

  private getAllProcessedData(): T[] {
    return [];
  }
}

async function generateTestData(count: number): Promise<DataPoint[]> {
  const data: DataPoint[] = [];
  
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      value: Math.random() * 1000,
      timestamp: new Date(),
      metadata: {
        source: 'generator',
        batch: Math.floor(i / 100),
        random: Math.random()
      }
    });
  }

  return data;
}

type EventHandler<T> = (event: T) => void;
type AsyncEventHandler<T> = (event: T) => Promise<void>;

interface EventEmitter<T> {
  on(event: string, handler: EventHandler<T>): void;
  onAsync(event: string, handler: AsyncEventHandler<T>): void;
  emit(event: string, data: T): void;
}

class SimpleEventEmitter<T> implements EventEmitter<T> {
  private handlers: Map<string, EventHandler<T>[]> = new Map();
  private asyncHandlers: Map<string, AsyncEventHandler<T>[]> = new Map();

  on(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  onAsync(event: string, handler: AsyncEventHandler<T>): void {
    if (!this.asyncHandlers.has(event)) {
      this.asyncHandlers.set(event, []);
    }
    this.asyncHandlers.get(event)!.push(handler);
  }

  emit(event: string, data: T): void {
    const syncHandlers = this.handlers.get(event) || [];
    syncHandlers.forEach(handler => handler(data));

    const asyncHandlers = this.asyncHandlers.get(event) || [];
    asyncHandlers.forEach(handler => handler(data).catch(console.error));
  }
}

async function main(): Promise<void> {
  console.log('Starting performance test...');
  console.log('This demonstrates complex TypeScript transpilation with Rust HappyPack');

  const processor = new DataProcessor<DataPoint>(50);
  const eventEmitter = new SimpleEventEmitter<ProcessingResult>();

  eventEmitter.on('processing-complete', (result) => {
    console.log(`Processing completed: ${result.statistics.count} items processed`);
    console.log(`Average value: ${result.statistics.average.toFixed(2)}`);
  });

  eventEmitter.onAsync('processing-complete', async (result) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('Async processing complete handler finished');
  });

  const testData = await generateTestData(1000);
  await processor.addData(testData);
  
  const result = await processor.processAll();
  eventEmitter.emit('processing-complete', result);

  console.log('Performance test completed!');
}

main().catch(console.error);

export { DataProcessor, DataPoint, ProcessingResult, SimpleEventEmitter };
export default main;
