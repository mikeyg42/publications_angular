// maze-solver.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MazeSolverService {
  private ctx!: CanvasRenderingContext2D;
  private cw!: number;
  private ch!: number;

  async solveMaze(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ): Promise<void> {
    this.ctx = ctx;
    this.cw = canvasWidth;
    this.ch = canvasHeight;

    // Capture the image data
    const imageData = this.ctx.getImageData(0, 0, this.cw, this.ch);

    return new Promise((resolve, reject) => {
      this.processWithWorker(imageData, resolve, reject);
    });
  }

  private processWithWorker(
    imageData: ImageData, 
    resolve: () => void, 
    reject: (error: any) => void
  ) {    
    // Initialize the worker
    const worker = new Worker(new URL('./maze-worker.worker', import.meta.url));

    // Receive results from the worker
    worker.onmessage = async (event) => {
      const { frames } = event.data;
      await this.animate(frames);
      worker.terminate();
      resolve();
    };

    // Handle worker errors
    worker.onerror = (error) => {
      console.error('Worker error:', error);
      worker.terminate();
      reject(error);
    };

    // Send the image data to the worker using transferable objects
    worker.postMessage({ imageData }, [imageData.data.buffer]);
  }

  private async animate(
    frames: { imageData: ImageData; delay: number }[]
  ) {
    for (const frame of frames) {
      this.ctx.putImageData(frame.imageData, 0, 0);
      await this.delay(frame.delay);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
