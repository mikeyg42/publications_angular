// maze-worker.worker.ts
/// <reference lib="webworker" />

addEventListener('message', (event) => {
  const { imageData } = event.data as { imageData: ImageData };

  // Perform heavy computations
  const { frames, totalAnimationTime } = processMaze(imageData);

  // Collect transferable objects (buffers)
  const transferableBuffers = frames.map((frame) => frame.imageData.data.buffer);

  // Post the results back to the main thread using transferable objects
  postMessage({ frames, totalAnimationTime }, transferableBuffers);
});

function processMaze(
  imageData: ImageData
): { frames: { imageData: ImageData; delay: number }[]; totalAnimationTime: number } {
  // Convert image to grid
  const gridData = convertImageToGrid(imageData);

  // Find connected components
  const { components, largestComponent } = findConnectedComponents(gridData);

  // Bin components and assign colors
  const { componentColors, bins } = assignColors(components, largestComponent);

  // Prepare animation frames with fizzle-in effect
  const frames = prepareAnimationFramesFizzleIn(
    imageData,
    componentColors,
    bins,
    largestComponent
  );

  // Define total animation time (e.g., 2000 ms)
  const totalAnimationTime = 2000;

  return { frames, totalAnimationTime };
}

function convertImageToGrid(imageData: ImageData): number[][] {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const grid: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      // Black pixels (paths)
      if (r === 0 && g === 0 && b === 0) {
        row.push(0); // 0 represents a path
      } else {
        row.push(1); // 1 represents a wall
      }
    }
    grid.push(row);
  }

  return grid;
}

function findConnectedComponents(gridData: number[][]): {
  components: Component[];
  largestComponent: Component;
} {
  const height = gridData.length;
  const width = gridData[0].length;
  const visited = Array.from({ length: height }, () =>
    Array(width).fill(false)
  );
  const components: Component[] = [];
  let componentId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited[y][x] && gridData[y][x] === 0) {
        const pixels: [number, number][] = [];
        const size = floodFill(
          gridData,
          visited,
          x,
          y,
          width,
          height,
          pixels
        );
        components.push({ id: componentId++, size, pixels });
      }
    }
  }

  // Find the largest component
  const largestComponent = components.reduce((prev, current) =>
    current.size > prev.size ? current : prev
  );

  return { components, largestComponent };
}

function floodFill(
  grid: number[][],
  visited: boolean[][],
  x: number,
  y: number,
  width: number,
  height: number,
  componentPixels: [number, number][]
): number {
  const stack: [number, number][] = [];
  stack.push([x, y]);
  visited[y][x] = true;
  let size = 0;

  const directions = [
    [0, -1], // Up
    [0, 1], // Down
    [-1, 0], // Left
    [1, 0], // Right
  ];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    componentPixels.push([cx, cy]);
    size++;

    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (
        nx >= 0 &&
        nx < width &&
        ny >= 0 &&
        ny < height &&
        !visited[ny][nx] &&
        grid[ny][nx] === 0
      ) {
        visited[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
  }

  return size;
}

function assignColors(
  components: Component[],
  largestComponent: Component
): { componentColors: Map<number, [number, number, number]>; bins: Bin[] } {
  // Remove the largest component from the list
  components = components.filter((comp) => comp !== largestComponent);

  // Bin the remaining components based on size
  const bins = binComponents(components);

  const componentColors = new Map<number, [number, number, number]>();

  // Total number of bins
  const totalBins = bins.length;

  // Assign colors to components in each bin
  for (let i = 0; i < totalBins; i++) {
    const bin = bins[i];
    let color: [number, number, number];

    if (bin.components.length > 5) {
      // Color components in this bin black
      color = [0, 0, 0];
    } else {
      // Calculate brightness for this bin using exponential decay formula
      const binRank = i + 1; // Bins are ranked starting from 1
      const brightness = calculateBrightness(binRank, totalBins);
      color = [brightness, 0, 0]; // Shades of red
    }

    for (const comp of bin.components) {
      componentColors.set(comp.id, color);
    }
  }

  // Assign cyan color to the largest component
  componentColors.set(largestComponent.id, [0, 255, 255]);

  return { componentColors, bins };
}

function binComponents(components: Component[]): Bin[] {
  // Determine the size range
  const sizes = components.map((c) => c.size);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);

  // Decide on binning strategy (e.g., logarithmic bins)
  const binCount = 10; // Adjust as needed
  const bins: Bin[] = [];

  const logMin = Math.log(minSize);
  const logMax = Math.log(maxSize);
  const binWidth = (logMax - logMin) / binCount;

  // Initialize bins
  for (let i = 0; i < binCount; i++) {
    bins.push({ components: [] });
  }

  // Assign components to bins
  for (const comp of components) {
    const logSize = Math.log(comp.size);
    const binIndex = Math.min(
      binCount - 1,
      Math.floor((logSize - logMin) / binWidth)
    );
    bins[binIndex].components.push(comp);
  }

  // Remove empty bins
  return bins.filter((bin) => bin.components.length > 0);
}

function calculateBrightness(binRank: number, totalBins: number): number {
  const ln255 = Math.log(255);
  const lambda = ln255 / (totalBins - 1);
  const exponent = -lambda * (binRank - 1);
  let brightness = 255 * Math.exp(exponent);

  // Ensure brightness is within valid range [0, 255]
  brightness = Math.max(0, Math.min(255, brightness));

  return Math.round(brightness);
}

function prepareAnimationFramesFizzleIn(
  originalImageData: ImageData,
  componentColors: Map<number, [number, number, number]>,
  bins: Bin[],
  largestComponent: Component
): { imageData: ImageData; delay: number }[] {
  const frames: { imageData: ImageData; delay: number }[] = [];
  const totalAnimationTime = 2000; // Total animation time in milliseconds

  // Create a copy of the original image data
  const width = originalImageData.width;
  const height = originalImageData.height;
  const data = new Uint8ClampedArray(originalImageData.data);

  // Prepare a list of pixels to reveal
  const pixelsToReveal: { x: number; y: number; color: [number, number, number] }[] = [];

  // For all components (excluding the largest)
  for (const bin of bins) {
    for (const comp of bin.components) {
      const color = componentColors.get(comp.id)!;
      for (const [x, y] of comp.pixels) {
        pixelsToReveal.push({ x, y, color });
      }
    }
  }

  // Shuffle the pixels for the fizzle-in effect
  shuffleArray(pixelsToReveal);

  // Determine the number of frames and delay per frame
  const totalFrames = 50; // Adjust for smoothness and performance
  const delayPerFrame = totalAnimationTime / totalFrames;

  // Determine how many pixels to reveal per frame
  const pixelsPerFrame = Math.ceil(pixelsToReveal.length / totalFrames);

  // Generate frames
  for (let f = 0; f < totalFrames; f++) {
    const start = f * pixelsPerFrame;
    const end = Math.min(start + pixelsPerFrame, pixelsToReveal.length);

    for (let i = start; i < end; i++) {
      const { x, y, color } = pixelsToReveal[i];
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }

    // Create a new ImageData object for this frame
    const frameImageData = new ImageData(new Uint8ClampedArray(data), width, height);
    frames.push({ imageData: frameImageData, delay: delayPerFrame });
  }

  // Finally, reveal the largest component
  const color = componentColors.get(largestComponent.id)!;
  for (const [x, y] of largestComponent.pixels) {
    const index = (y * width + x) * 4;
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = 255;
  }
  const finalFrameImageData = new ImageData(new Uint8ClampedArray(data), width, height);
  frames.push({ imageData: finalFrameImageData, delay: 0 });

  return frames;
}

function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Define types for Component, Bin, etc.
interface Component {
  id: number;
  size: number;
  pixels: [number, number][];
}

interface Bin {
  components: Component[];
}
