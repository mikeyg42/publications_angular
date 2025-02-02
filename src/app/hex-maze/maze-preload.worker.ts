// maze-preload.worker.ts
/// <reference lib="webworker" />

addEventListener('message', (event) => {
    const { width, height } = event.data;
  
    // Generate the maze
    const imageData = generateMazeImageData(width, height);
  
    // Transfer the image data back to the main thread
    postMessage({ imageData }, [imageData.data.buffer]);
  });
  
  function generateMazeImageData(width: number, height: number): ImageData {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
  
    // Generate maze:
      // start with placeholder maze generation (fill with black and white rectangles)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
  
    ctx.fillStyle = 'white';
    for (let i = 0; i < 100; i++) {
      ctx.fillRect(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 50,
        Math.random() * 50
      );
    }
  
    // Draw a thicker boundary extending inward
    drawBorder(ctx, width, height);
  
    const imageData = ctx.getImageData(0, 0, width, height);
    return imageData;
  }
  
  function drawBorder(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 12; // Adjust the thickness as needed
    ctx.strokeRect(5, 5, width - 10, height - 10); // Offset to extend inward
    ctx.restore();
  }
  