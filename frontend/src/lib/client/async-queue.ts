/***
 * AsyncQueue is a queue that can be consumed asynchronously.
 * It is used to pass data between the main thread and the worker thread.
 * The main thread pushes data to the queue, and the worker thread consumes it until the queue is closed.
 *
 */
export interface AsyncQueue<T> {
    /**
     * Pushes an item to the queue.
     * @param item
     */
    push(item: T): void;

    /**
     * Consumes the queue.
     * @returns an async iterator that can be used to consume the queue.
     */
    consume(): AsyncGenerator<T>

    /**
     * Closes the queue.
     * This will cause the async iterator returned by consume() to stop iterating.
     */
    close(): void;

    /**
     * Returns true if the queue is closed.
     */
    closed: boolean;
}

type Resolver<T> = (value: T) => void;

export class AsyncQueueImpl<T> implements AsyncQueue<T> {
    private queue: T[] = [];
    private resolvers: Resolver<T>[] = [];
    private _closed = false;

    public get closed(): boolean {
        return this._closed;
    }

    push(item: T): void {
        if (this._closed) {
            throw new Error("Queue is closed");
        }
        if (this.resolvers.length > 0) {
            while (this.resolvers.length > 0) {
                const resolve = this.resolvers.shift();
                resolve?.(item);
            }
        } else {
            this.queue.push(item);
        }
    }

    async* consume(): AsyncGenerator<T> {
        while (true) {
            if (this.queue.length > 0) {
                yield this.queue.shift() as T;
            } else if (this._closed) {
                return;
            } else {
                yield new Promise<T>(resolve => this.resolvers.push(resolve));
            }
        }
    }

    close(): void {
        this._closed = true;
        while (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift();
            resolve?.(undefined as unknown as T);
        }
    }
}
