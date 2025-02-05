// maze-solver.service.ts
import { Injectable } from '@angular/core';
import { PathMap, PathCell } from './maze-generator.service';

interface SolverPath {
  points: { x: number; y: number }[];
  length: number;
}

interface Frame {
  imageData: ImageData;
  delay: number;
  paths?: {
    primary: { x: number; y: number }[];
    secondary?: { x: number; y: number }[];
  };
}

@Injectable({
  providedIn: 'root',
})
export class MazeSolverService {
  private readonly hexSize: number = 20;
  private ctx!: CanvasRenderingContext2D;
  private cw!: number;
  private ch!: number;

  async solveMaze(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pathMap: PathMap
  ): Promise<void> {
    this.ctx = ctx;
    this.cw = width;
    this.ch = height;

    // Find start and end cells (first and last cells in first/last rows)
    const startCell = pathMap.cells.find(cell => cell.position.row === 0);
    const endCell = pathMap.cells
      .filter(cell => cell.position.row === pathMap.dimensions.rows - 1)
      .sort((a, b) => b.position.col - a.position.col)[0];

    if (!startCell || !endCell) {
      console.error('Could not find start or end cells');
      return;
    }

    // Find all paths using the path map
    const paths = this.findAllPaths(pathMap, startCell, endCell);
    
    // Sort paths by length and get longest two
    paths.sort((a, b) => b.length - a.length);
    const primaryPath = paths[0];
    const secondaryPath = paths[1];

    // Animate the solution
    await this.animateSolution(primaryPath, secondaryPath);
  }

  private findAllPaths(pathMap: PathMap, start: PathCell, end: PathCell): SolverPath[] {
    const paths: SolverPath[] = [];
    const visited = new Set<string>();
    
    const stack = [{
      cell: start,
      path: [{ x: start.position.x, y: start.position.y }]
    }];

    while (stack.length > 0) {
      const { cell, path } = stack.pop()!;
      const key = `${cell.position.row},${cell.position.col}`;

      if (!visited.has(key)) {
        visited.add(key);

        if (cell === end) {
          paths.push({ points: [...path], length: path.length });
          continue;
        }

        // Get neighboring cells through open paths
        const neighbors = this.getNeighbors(cell, pathMap);
        
        for (const neighbor of neighbors) {
          if (!visited.has(`${neighbor.position.row},${neighbor.position.col}`)) {
            stack.push({
              cell: neighbor,
              path: [...path, { x: neighbor.position.x, y: neighbor.position.y }]
            });
          }
        }
      }
    }

    return paths;
  }

  private getNeighbors(cell: PathCell, pathMap: PathMap): PathCell[] {
    const neighbors: PathCell[] = [];
    
    // Check each open path direction
    for (const direction of cell.openPaths) {
      // Find the cell in that direction
      const neighborCell = pathMap.cells.find(c => {
        const rowDiff = c.position.row - cell.position.row;
        const colDiff = c.position.col - cell.position.col;
        
        // Match the direction with the hex grid geometry
        switch (direction) {
          case 0: return rowDiff === -1 && colDiff === (cell.position.row % 2 === 0 ? 0 : 1);  // NE
          case 1: return rowDiff === 0 && colDiff === 1;   // E
          case 2: return rowDiff === 1 && colDiff === (cell.position.row % 2 === 0 ? 0 : 1);   // SE
          case 3: return rowDiff === 1 && colDiff === (cell.position.row % 2 === 0 ? -1 : 0);  // SW
          case 4: return rowDiff === 0 && colDiff === -1;  // W
          case 5: return rowDiff === -1 && colDiff === (cell.position.row % 2 === 0 ? -1 : 0); // NW
          default: return false;
        }
      });

      if (neighborCell) {
        neighbors.push(neighborCell);
      }
    }

    return neighbors;
  }

  private async animateSolution(
    primaryPath: SolverPath,
    secondaryPath?: SolverPath
  ): Promise<void> {
    const fullState = this.ctx.getImageData(0, 0, this.cw, this.ch);
    const offset = { x: this.hexSize * 2, y: this.hexSize * 2 }; // Account for padding
    
    const frame: Frame = {
      imageData: fullState,
      delay: 0,
      paths: {
        primary: primaryPath.points,
        secondary: secondaryPath?.points
      }
    };

    await this.animate([frame], fullState, offset);
  }

  private async animate(
    frames: Frame[],
    fullState: ImageData,
    offset: { x: number, y: number }
  ) {
    if (!Array.isArray(frames)) {
      console.error('Invalid frames data:', frames);
      return;
    }

    for (const frame of frames) {
      try {
        // Put the frame data in the correct position
        this.ctx.putImageData(frame.imageData, offset.x, offset.y);

        // Draw paths if they exist
        if (frame.paths) {
          if (Array.isArray(frame.paths.secondary)) {
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            frame.paths.secondary.forEach((point, i) => {
              if (i === 0) {
                this.ctx.moveTo(point.x + offset.x, point.y + offset.y);
              } else {
                this.ctx.lineTo(point.x + offset.x, point.y + offset.y);
              }
            });
            this.ctx.stroke();
          }

          if (Array.isArray(frame.paths.primary)) {
            this.ctx.strokeStyle = '#00ffff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            frame.paths.primary.forEach((point, i) => {
              if (i === 0) {
                this.ctx.moveTo(point.x + offset.x, point.y + offset.y);
              } else {
                this.ctx.lineTo(point.x + offset.x, point.y + offset.y);
              }
            });
            this.ctx.stroke();
          }
        }

        // Restore borders...
        this.ctx.putImageData(
          fullState,
          0,
          0,
          0,
          0,
          offset.x,
          this.ch
        ); // Left border
        this.ctx.putImageData(
          fullState,
          0,
          0,
          this.cw - offset.x,
          0,
          offset.x,
          this.ch
        ); // Right border
        this.ctx.putImageData(
          fullState,
          0,
          0,
          0,
          0,
          this.cw,
          offset.y
        ); // Top border
        this.ctx.putImageData(
          fullState,
          0,
          0,
          0,
          this.ch - offset.y,
          this.cw,
          offset.y
        ); // Bottom border
        
        await this.delay(frame.delay);
      } catch (error) {
        console.error('Error animating frame:', error);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
