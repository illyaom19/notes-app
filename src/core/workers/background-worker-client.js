export class BackgroundWorkerClient {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.worker = null;
    this.ready = false;
  }

  async start() {
    if (!this.worker) {
      this.worker = new Worker(this.workerUrl, { type: "module" });
    }

    if (!this.ready) {
      await this._ping();
      this.ready = true;
    }

    return this.ready;
  }

  _ping() {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Worker ping timed out."));
      }, 2000);

      const onMessage = (event) => {
        if (event.data?.type !== "pong") {
          return;
        }
        clearTimeout(timeout);
        this.worker.removeEventListener("message", onMessage);
        resolve(true);
      };

      this.worker.addEventListener("message", onMessage);
      this.worker.postMessage({ type: "ping" });
    });
  }
}
