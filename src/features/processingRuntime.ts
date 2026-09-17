export class ProcessingTimeout extends Error {}

export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProcessingTimeout(`${label} timed out`)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** A timed-out native operation retains its slot until native completion. */
export class ProcessingQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private stalled = false;

  private readonly timeoutMs: number;
  constructor(timeoutMs = 15000) { this.timeoutMs = timeoutMs; }

  run<T>(job: () => Promise<T>): Promise<T> {
    if (this.stalled) return Promise.reject(new ProcessingTimeout('Image processor is unavailable'));
    const native = this.tail.then(() => {
      if (this.stalled) throw new ProcessingTimeout('Image processor is unavailable');
      return job();
    });
    this.tail = native.then(() => undefined, () => undefined);
    return withDeadline(native, this.timeoutMs, 'Image processing').catch((error) => {
      if (error instanceof ProcessingTimeout) {
        this.stalled = true;
        const pending = this.tail;
        void pending.finally(() => { if (this.tail === pending) this.stalled = false; }).catch(() => {});
      }
      throw error;
    });
  }
}

export class ArtifactScope {
  private readonly files = new Set<string>();
  private closed = false;

  private readonly remove: (uri: string) => Promise<unknown>;
  constructor(remove: (uri: string) => Promise<unknown>) { this.remove = remove; }

  track = (uri: string): void => { this.files.add(uri); };
  retain = (uri: string): void => { this.files.delete(uri); };

  assertOpen(): void {
    if (this.closed) throw new ProcessingTimeout('Capture processing was cancelled');
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    this.assertOpen();
    try { return await job(); }
    finally { if (this.closed) await this.sweep(); }
  }

  private async sweep(): Promise<void> {
    await Promise.all([...this.files].map((uri) => this.remove(uri).catch(() => {})));
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.sweep();
  }
}
