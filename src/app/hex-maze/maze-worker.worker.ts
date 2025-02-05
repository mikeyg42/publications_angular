// maze-worker.worker.ts
/// <reference lib="webworker" />

interface Point {
  x: number;
  y: number;
}

interface Path {
  points: Point[];
  length: number;
}

interface Frame {
  imageData: ImageData;
  delay: number;
  paths?: {
    primary: Point[];
    secondary?: Point[];
  };
}

interface HexCoord {
  x: number;
  y: number;
}

interface Component {
  pixels: HexCoord[];
  size: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface HexGridDimensions {
  cellWidth: number;
  cellHeight: number;
}

interface GraphVisualization {
  edges: {
    from: HexCoord;
    to: HexCoord;
  }[];
}

interface HexNode {
  center: HexCoord;
  neighbors: Set<number>;  // indices into the nodes array
}

interface HexGraph {
  nodes: HexNode[];
  size: number;
}

interface ChunkResult {
  chunkId: number;
  components: Component[];
  borderPixels: Map<string, HexCoord>; // Pixels at chunk boundaries
}

interface MergeInstruction {
  componentId1: number;
  componentId2: number;
  connection: HexCoord[];
}

function debug(message: string, ...args: any[]) {
  postMessage({ type: 'debug', message, args });
}

addEventListener('message', ({ data }) => {
  const hexDims = calculateHexSize(data.imageData);
  const grid = convertToGrid(data.imageData);
  const components = findConnectedComponents(grid, hexDims);
  
  debug('Found components:', components.map(c => ({
    size: c.size,
    pixelCount: c.pixels.length,
    bounds: c.bounds
  })));
  
  if (components.length >= 1) {
    let coloredImage = new ImageData(
      new Uint8ClampedArray(data.imageData.data),
      data.imageData.width,
      data.imageData.height
    );
    
    // Build and visualize graphs
    debug('Building graphs for components...');
    const graphs = components.slice(0, 2).map((comp, idx) => {
      debug(`Building graph for component ${idx}...`);
      const graph = buildHexGraph(comp, hexDims);
      debug(`Component ${idx} graph:`, {
        nodes: graph.nodes.length,
        totalEdges: graph.nodes.reduce((sum, node) => sum + node.neighbors.size, 0) / 2
      });
      return graph;
    });
    
    const visualizations = graphs.map((graph, idx) => {
      const vis = visualizeGraph(graph);
      debug(`Component ${idx} visualization:`, {
        edgeCount: vis.edges.length,
        sampleEdges: vis.edges.slice(0, 3).map(edge => ({
          from: `(${edge.from.x.toFixed(2)}, ${edge.from.y.toFixed(2)})`,
          to: `(${edge.to.x.toFixed(2)}, ${edge.to.y.toFixed(2)})`
        }))
      });
      return vis;
    });
    
    debug('Creating OffscreenCanvas for drawing...');
    const canvas = new OffscreenCanvas(data.imageData.width, data.imageData.height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      debug('Failed to get 2D context');
      postMessage({ error: 'Failed to get 2D context' });
      return;
    }
    
    debug('Drawing initial image...');
    ctx.putImageData(coloredImage, 0, 0);
    
    // Draw first component's edges
    debug('Drawing first component edges...');
    ctx.strokeStyle = 'rgb(0, 255, 255)';
    ctx.lineWidth = 2;
    visualizations[0].edges.forEach((edge, idx) => {
      ctx.beginPath();
      ctx.moveTo(edge.from.x, edge.from.y);
      ctx.lineTo(edge.to.x, edge.to.y);
      ctx.stroke();
      if (idx < 3) {
        debug(`Drew edge from (${edge.from.x.toFixed(2)}, ${edge.from.y.toFixed(2)}) to (${edge.to.x.toFixed(2)}, ${edge.to.y.toFixed(2)})`);
      }
    });
    
    // Draw second component's edges
    if (visualizations[1]) {
      debug('Drawing second component edges...');
      ctx.strokeStyle = 'rgb(255, 0, 0)';
      visualizations[1].edges.forEach((edge, idx) => {
        ctx.beginPath();
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
        ctx.stroke();
        if (idx < 3) {
          debug(`Drew edge from (${edge.from.x.toFixed(2)}, ${edge.from.y.toFixed(2)}) to (${edge.to.x.toFixed(2)}, ${edge.to.y.toFixed(2)})`);
        }
      });
    }
    
    debug('Getting final image data...');
    coloredImage = ctx.getImageData(0, 0, data.imageData.width, data.imageData.height);
    
    debug('Posting message with results...');
    postMessage({
      components,
      graphs,
      coloredImage
    });
  } else {
    debug('No valid components found');
    postMessage({ error: 'No valid components found' });
  }
});

function findPaths(imageData: ImageData): { longest: Path; secondLongest: Path } {
  const start = findStartPoint(imageData);
  const end = findEndPoint(imageData);
  console.log('Start point:', start);
  console.log('End point:', end);
  
  const grid = convertToGrid(imageData);
  console.log('Grid size:', grid.length, 'x', grid[0].length);
  
  const allPaths = findAllPaths(grid, start, end);
  console.log('Found paths:', allPaths.length);
  
  if (allPaths.length === 0) {
    // Create a default path if none found
    return {
      longest: { points: [start, end], length: 2 },
      secondLongest: { points: [start, end], length: 2 }
    };
  }
  
  allPaths.sort((a: Path, b: Path) => b.length - a.length);
  
  return {
    longest: allPaths[0],
    secondLongest: allPaths[1] || allPaths[0]
  };
}

function findStartPoint(imageData: ImageData): Point {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  debug('Looking for start point', width, height);
  
  // Search the entire image for the first valid path pixel (dark pixel)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Look for dark pixels (paths) instead of white pixels (walls)
      if (data[idx] < 100 && data[idx + 1] < 100 && data[idx + 2] < 100) {
        debug('Found start at', x, y);
        return { x, y };
      }
    }
  }
  debug('No valid start point found');
  return { x: 0, y: 0 }; // Fallback to top-left corner
}

function findEndPoint(imageData: ImageData): Point {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // Search from the end of the image backwards for the last valid path pixel
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = (y * width + x) * 4;
      // Look for dark pixels (paths) instead of white pixels (walls)
      if (data[idx] < 100 && data[idx + 1] < 100 && data[idx + 2] < 100) {
        debug('Found end at', x, y);
        return { x, y };
      }
    }
  }
  debug('No valid end point found');
  return { x: width - 1, y: height - 1 }; // Fallback to bottom-right corner
}

function convertToGrid(imageData: ImageData): boolean[][] {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const grid: boolean[][] = [];
  let pathCount = 0;
  
  debug('Creating grid', width, height);
  
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      // Invert the logic: dark pixels (< 100) are paths
      const isPath = brightness < 100;
      grid[y][x] = isPath;
      if (isPath) pathCount++;
    }
  }
  
  debug(`Found ${pathCount} paths in ${width}x${height} grid`);
  return grid;
}

function findAllPaths(grid: boolean[][], start: Point, end: Point): Path[] {
  const paths: Path[] = [];
  const visited = new Set<string>();
  
  debug('Starting path search', { start, end, gridSize: `${grid[0].length}x${grid.length}` });
  
  // Priority queue style stack - higher scores get popped first
  const stack: { point: Point; path: Point[]; score: number }[] = [{
    point: start,
    path: [start],
    score: getPathScore(grid, start)
  }];
  
  while (stack.length > 0) {
    const { point: current, path: currentPath, score } = stack.pop()!;
    const key = `${current.x},${current.y}`;
    
    if (!visited.has(key)) {
      visited.add(key);
      
      // If we've reached the end point
      if (current.x === end.x && current.y === end.y) {
        debug('Found path of length', currentPath.length);
        paths.push({
          points: [...currentPath],
          length: currentPath.length
        });
        continue;
      }
      
      // Adjacent cell directions for hex grid
      const directions = [
        { dx: 1, dy: 0 },   // right
        { dx: -1, dy: 0 },  // left
        { dx: 0.5, dy: 1 },   // down-right
        { dx: -0.5, dy: 1 },  // down-left
        { dx: 0.5, dy: -1 },  // up-right
        { dx: -0.5, dy: -1 }  // up-left
      ];
      
      for (const { dx, dy } of directions) {
        const nextX = current.x + dx;
        const nextY = current.y + dy;
        const nextKey = `${nextX},${nextY}`;
        
        if (!visited.has(nextKey) && isValidMove(grid, nextX, nextY)) {
          const nextPoint = { x: nextX, y: nextY };
          const nextScore = getPathScore(grid, nextPoint);
          
          stack.push({
            point: nextPoint,
            path: [...currentPath, nextPoint],
            score: score + nextScore
          });
        }
      }
      
      // Sort stack by score to explore better paths first
      stack.sort((a, b) => b.score - a.score);
    }
  }
  
  paths.sort((a, b) => b.length - a.length);
  return paths.slice(0, 2);
}

function getPathScore(grid: boolean[][], point: Point): number {
  if (!isValidMove(grid, point.x, point.y)) return 0;
  
  // Simple distance-based scoring
  return 1;
}

function isValidMove(grid: boolean[][], x: number, y: number): boolean {
  // Round coordinates to handle hex grid fractional movements
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  
  // Check bounds
  if (roundedX < 0 || roundedX >= grid[0].length || 
      roundedY < 0 || roundedY >= grid.length) {
    return false;
  }
  
  // Check if this is a valid path (dark pixel)
  return grid[roundedY][roundedX];
}

function findConnectedComponentsParallel(grid: boolean[][], hexDims: HexGridDimensions): Promise<Component[]> {
  const CHUNK_SIZE = 200; // Adjust based on image size and available cores
  const chunks: boolean[][][] = [];
  const numWorkers = navigator.hardwareConcurrency || 4;
  
  // Split grid into chunks with overlap
  function splitIntoChunks() {
    const overlap = 1; // Overlap by one hex to ensure we can connect components
    
    for (let y = 0; y < grid.length; y += CHUNK_SIZE) {
      for (let x = 0; x < grid[0].length; x += CHUNK_SIZE) {
        const chunk: boolean[][] = [];
        const endY = Math.min(y + CHUNK_SIZE + overlap, grid.length);
        const endX = Math.min(x + CHUNK_SIZE + overlap, grid[0].length);
        
        for (let cy = Math.max(0, y - overlap); cy < endY; cy++) {
          chunk.push(grid[cy].slice(Math.max(0, x - overlap), endX));
        }
        
        chunks.push(chunk);
      }
    }
    return chunks;
  }

  // Process each chunk in a separate worker
  function processChunk(chunk: boolean[][], chunkId: number): Promise<ChunkResult> {
    return new Promise((resolve) => {
      const worker = new Worker('chunk-worker.js');
      
      worker.onmessage = ({ data }) => {
        resolve(data);
        worker.terminate();
      };
      
      worker.postMessage({ chunk, chunkId, hexDims });
    });
  }

  // Merge results from different chunks
  function mergeResults(results: ChunkResult[]): Component[] {
    const mergeInstructions: MergeInstruction[] = [];
    const componentMap = new Map<number, Component>();
    
    // First, identify components that need to be merged
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      
      // Add all components to the map
      result.components.forEach((comp, idx) => {
        componentMap.set(i * 1000 + idx, comp); // Unique ID for each component
      });
      
      // Check for connections with other chunks
      for (const [key, pixel] of result.borderPixels) {
        for (let j = i + 1; j < results.length; j++) {
          const otherResult = results[j];
          if (otherResult.borderPixels.has(key)) {
            // Found a connection between components
            mergeInstructions.push({
              componentId1: i * 1000 + result.components.findIndex(c => 
                c.pixels.some(p => p.x === pixel.x && p.y === pixel.y)),
              componentId2: j * 1000 + otherResult.components.findIndex(c => 
                c.pixels.some(p => p.x === pixel.x && p.y === pixel.y)),
              connection: [pixel]
            });
          }
        }
      }
    }
    
    // Merge components based on instructions
    for (const instruction of mergeInstructions) {
      const comp1 = componentMap.get(instruction.componentId1)!;
      const comp2 = componentMap.get(instruction.componentId2)!;
      
      // Merge comp2 into comp1
      comp1.pixels.push(...comp2.pixels, ...instruction.connection);
      comp1.size = comp1.pixels.length;
      comp1.bounds = {
        minX: Math.min(comp1.bounds.minX, comp2.bounds.minX),
        maxX: Math.max(comp1.bounds.maxX, comp2.bounds.maxX),
        minY: Math.min(comp1.bounds.minY, comp2.bounds.minY),
        maxY: Math.max(comp1.bounds.maxY, comp2.bounds.maxY)
      };
      
      componentMap.delete(instruction.componentId2);
    }
    
    return Array.from(componentMap.values())
      .sort((a, b) => b.size - a.size)
      .slice(0, 2); // Return only the two largest components
  }

  // Main parallel processing flow
  return new Promise(async (resolve) => {
    const chunkedGrid = splitIntoChunks();
    const chunkPromises = chunkedGrid.map((chunk, idx) => 
      processChunk(chunk, idx));
    
    const results = await Promise.all(chunkPromises);
    const mergedComponents = mergeResults(results);
    resolve(mergedComponents);
  });
}

function calculateHexSize(imageData: ImageData): HexGridDimensions {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // Find the first black pixel (path)
  let firstX = -1, firstY = -1;
  let nextX = -1;
  
  // Scan horizontally to find first path pixel and next path pixel after a wall
  for (let y = 0; y < height; y++) {
    let foundFirst = false;
    let inWall = false;
    
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isPath = data[idx] < 100 && data[idx + 1] < 100 && data[idx + 2] < 100;
      
      if (isPath) {
        if (!foundFirst) {
          firstX = x;
          firstY = y;
          foundFirst = true;
        } else if (inWall) {
          // Found next path pixel after a wall
          nextX = x;
          break;
        }
      } else {
        if (foundFirst) {
          inWall = true;
        }
      }
    }
    if (nextX !== -1) break;
  }
  
  // Calculate cell width from distance between centers of adjacent hexes
  const cellWidth = nextX - firstX;
  
  // In a hex grid, height is approximately 1.1547 (2*sqrt(3)/3) times the width
  const cellHeight = Math.round(cellWidth * 1.1547);
  
  debug('Calculated hex dimensions:', { cellWidth, cellHeight });
  
  return { 
    cellWidth: Math.max(cellWidth, 1), 
    cellHeight: Math.max(cellHeight, 1) 
  };
}

function visualizeGraph(graph: HexGraph): GraphVisualization {
  const edges: { from: HexCoord; to: HexCoord; }[] = [];
  const processed = new Set<string>();

  // Helper to create a unique key for an edge
  function getEdgeKey(from: number, to: number): string {
    // Always use smaller index first to avoid duplicates
    const [a, b] = [from, to].sort();
    return `${a}-${b}`;
  }

  // Collect all edges
  graph.nodes.forEach((node, nodeIdx) => {
    node.neighbors.forEach(neighborIdx => {
      const edgeKey = getEdgeKey(nodeIdx, neighborIdx);
      if (!processed.has(edgeKey)) {
        edges.push({
          from: node.center,
          to: graph.nodes[neighborIdx].center
        });
        processed.add(edgeKey);
      }
    });
  });

  return { edges };
}

function getHexCenter(x: number, y: number, hexDims: HexGridDimensions): HexCoord {
  // For a hex grid, centers should be offset:
  // - Every other row is shifted by cellWidth/2
  // - Vertical spacing is cellHeight
  const isOddRow = Math.floor(y / hexDims.cellHeight) % 2 === 1;
  const xOffset = isOddRow ? hexDims.cellWidth/2 : 0;
  
  return {
    x: Math.round((Math.floor(x / hexDims.cellWidth) * hexDims.cellWidth + xOffset) * 100) / 100,
    y: Math.round((Math.floor(y / hexDims.cellHeight) * hexDims.cellHeight) * 100) / 100
  };
}

function buildHexGraph(component: Component, hexDims: HexGridDimensions): HexGraph {
  const centers = new Map<string, number>();
  const nodes: HexNode[] = [];
  
  // The six possible neighbor directions for hex-to-hex connections
  const hexToHexDirections = [
    { dx: 1.0*hexDims.cellWidth, dy: 0 },      // right
    { dx: -1.0*hexDims.cellWidth, dy: 0 },     // left
    { dx: 0.5*hexDims.cellWidth, dy: 1.0*hexDims.cellHeight },    // down-right
    { dx: -0.5*hexDims.cellWidth, dy: 1.0*hexDims.cellHeight },   // down-left
    { dx: 0.5*hexDims.cellWidth, dy: -1.0*hexDims.cellHeight },   // up-right
    { dx: -0.5*hexDims.cellWidth, dy: -1.0*hexDims.cellHeight }   // up-left
  ];

  // Helper to get coordinate key with more precision
  function getKey(x: number, y: number): string {
    return `${Math.round(x * 100)},${Math.round(y * 100)}`; // Keep 2 decimal places
  }

  debug('Building graph with hex dimensions:', hexDims);
  
  // First pass: identify all hex centers
  component.pixels.forEach(pixel => {
    const center = getHexCenter(pixel.x, pixel.y, hexDims);
    const key = getKey(center.x, center.y);
    if (!centers.has(key)) {
      centers.set(key, nodes.length);
      nodes.push({
        center,
        neighbors: new Set()
      });
    }
  });

  debug(`Found ${nodes.length} hex centers`);

  // Second pass: connect neighbors with more precise comparison
  nodes.forEach((node, nodeIdx) => {
    hexToHexDirections.forEach(({ dx, dy }) => {
      const neighborX = node.center.x + (dx * hexDims.cellWidth);
      const neighborY = node.center.y + (dy * hexDims.cellHeight);
      const neighborKey = getKey(neighborX, neighborY);
      
      const neighborIdx = centers.get(neighborKey);
      if (neighborIdx !== undefined) {
        node.neighbors.add(neighborIdx);
        nodes[neighborIdx].neighbors.add(nodeIdx);
      }
    });
  });

  // Add debug output for connections
  nodes.forEach((node, idx) => {
    debug(`Node ${idx} at (${node.center.x.toFixed(2)}, ${node.center.y.toFixed(2)}) has ${node.neighbors.size} neighbors`);
  });

  return {
    nodes,
    size: nodes.length
  };
}

function findConnectedComponents(grid: boolean[][], hexDims: HexGridDimensions): Component[] {
  const visited = new Set<string>();
  const components: Component[] = [];
  const allCenters: HexCoord[] = [];
  
  // First pass: collect hex centers by sampling at hex grid spacing
  for (let row = 0; row < grid.length; row += 1) {
    const isOddRow = row % 2 === 1;
    const xStart = isOddRow ? hexDims.cellWidth/2 : 0;
    
    for (let col = 0; col < grid[0].length; col += 1) {
      if (!grid[row][col]) continue; // Skip walls
      
      const center = {
        x: Math.round((xStart + col * hexDims.cellWidth) * 100) / 100,
        y: Math.round((row * hexDims.cellHeight * 0.75) * 100) / 100  // 0.75 for proper hex vertical spacing
      };
      
      const key = `${center.x},${center.y}`;
      if (!visited.has(key)) {
        visited.add(key);
        allCenters.push(center);
      }
    }
  }

  debug('All identified hex centers:');
  allCenters.sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);
  allCenters.forEach(center => {
    debug(`(${center.x.toFixed(2)}, ${center.y.toFixed(2)})`);
  });

  // Reset visited set for component finding
  visited.clear();
  
  // Hex-to-hex distances (for finding neighboring centers)
  const hexNeighborDirections = [
    {dx: hexDims.cellWidth, dy: 0},            // right
    {dx: -hexDims.cellWidth, dy: 0},           // left
    {dx: hexDims.cellWidth/2, dy: hexDims.cellHeight},    // bottom right
    {dx: -hexDims.cellWidth/2, dy: hexDims.cellHeight},   // bottom left
    {dx: hexDims.cellWidth/2, dy: -hexDims.cellHeight},   // top right
    {dx: -hexDims.cellWidth/2, dy: -hexDims.cellHeight}   // top left
  ];

  // Wall check distances (halfway between hex centers)
  const wallCheckDirections = [
    {dx: 0.5*hexDims.cellWidth, dy: 0},     // right
    {dx: -0.5*hexDims.cellWidth, dy: 0},    // left
    {dx: 0.25*hexDims.cellWidth, dy: 0.5*hexDims.cellHeight},  // bottom right
    {dx: -0.25*hexDims.cellWidth, dy: 0.5*hexDims.cellHeight}, // bottom left
    {dx: 0.25*hexDims.cellWidth, dy: -0.5*hexDims.cellHeight}, // top right
    {dx: -0.25*hexDims.cellWidth, dy: -0.5*hexDims.cellHeight} // Fixed missing multiplication
  ];

  function hasWallBetween(from: HexCoord, direction: {dx: number, dy: number}): boolean {
    const wallX = Math.round(from.x + (direction.dx * hexDims.cellWidth));
    const wallY = Math.round(from.y + (direction.dy * hexDims.cellHeight));
    const hasWall = !grid[wallY]?.[wallX];
    debug(`Wall check from (${from.x}, ${from.y}) to (${wallX}, ${wallY}): ${hasWall ? 'WALL' : 'PATH'}`);
    return hasWall;
  }

  function getConnectedNeighbors(center: HexCoord): HexCoord[] {
    const neighbors: HexCoord[] = [];
    debug(`Checking neighbors for hex at (${center.x}, ${center.y})`);

    for (let i = 0; i < hexNeighborDirections.length; i++) {
      const neighborDir = hexNeighborDirections[i];
      const wallDir = wallCheckDirections[i];
      
      const neighborX = center.x + neighborDir.dx;
      const neighborY = center.y + neighborDir.dy;
      const key = `${neighborX},${neighborY}`;

      if (!visited.has(key) && !hasWallBetween(center, wallDir)) {
        debug(`Found connected neighbor at (${neighborX}, ${neighborY})`);
        neighbors.push({x: neighborX, y: neighborY});
      }
    }

    return neighbors;
  }

  function floodFill(startCenter: HexCoord): Component {
    debug(`Starting flood fill from (${startCenter.x.toFixed(2)}, ${startCenter.y.toFixed(2)})`);
    const pixels: HexCoord[] = [];
    const stack: HexCoord[] = [startCenter];
    let minX = startCenter.x, maxX = startCenter.x;
    let minY = startCenter.y, maxY = startCenter.y;
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      const key = `${Math.round(current.x * 100)},${Math.round(current.y * 100)}`;
      
      if (!visited.has(key)) {
        visited.add(key);
        pixels.push(current);
        debug(`Added hex center at (${current.x.toFixed(2)}, ${current.y.toFixed(2)}) to component`);
        
        minX = Math.min(minX, current.x);
        maxX = Math.max(maxX, current.x);
        minY = Math.min(minY, current.y);
        maxY = Math.max(maxY, current.y);
        
        const neighbors = getConnectedNeighbors(current);
        debug(`Found ${neighbors.length} connected neighbors`);
      }
    }
    
    debug(`Completed component with ${pixels.length} hexes, bounds: (${minX.toFixed(2)},${minY.toFixed(2)}) to (${maxX.toFixed(2)},${maxY.toFixed(2)})`);
    return {
      pixels,
      size: pixels.length,
      bounds: { minX, maxX, minY, maxY }
    };
  }

  // Start component detection
  let componentCount = 0;
  for (let y = 0; y < grid.length; y += hexDims.cellHeight) {
    for (let x = 0; x < grid[0].length; x += hexDims.cellWidth) {
      const center = getHexCenter(x, y, hexDims);
      const key = `${Math.round(center.x * 100)},${Math.round(center.y * 100)}`;
      if (!visited.has(key) && grid[Math.round(y/hexDims.cellHeight)][Math.round(x/hexDims.cellWidth)]) {
        debug(`\nStarting new component ${componentCount++} at (${center.x.toFixed(2)}, ${center.y.toFixed(2)})`);
        components.push(floodFill(center));
      }
    }
  }
  
  // Log final results
  debug('\nComponent Detection Results:');
  components.sort((a, b) => b.size - a.size);
  components.forEach((comp, idx) => {
    debug(`Component ${idx}: ${comp.size} hexes, bounds: (${comp.bounds.minX.toFixed(2)},${comp.bounds.minY.toFixed(2)}) to (${comp.bounds.maxX.toFixed(2)},${comp.bounds.maxY.toFixed(2)})`);
  });

  return components;
}