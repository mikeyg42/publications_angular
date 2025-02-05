import { Injectable } from '@angular/core';

interface HexCell {
  x: number;
  y: number;
  row: number;
  col: number;
  visited: boolean;
  walls: boolean[];  // [NE, E, SE, SW, W, NW]
  neighbors: (HexCell | null)[];
}

export interface PathMap {
  cells: PathCell[];
  dimensions: MazeDimensions;
}

export interface PathCell {
  position: {
    row: number;
    col: number;
    x: number;    // canvas coordinates
    y: number;    // canvas coordinates
  };
  openPaths: number[];  // indices of open walls [NE, E, SE, SW, W, NW]
}

export interface MazeDimensions {
  rows: number;
  cols: number;
  hexWidth: number;
  hexHeight: number;
  padding: {
    horizontal: number;
    vertical: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class MazeGeneratorService {
  private grid: HexCell[][] = [];
  private hexSize: number = 20; // radius of the cricumscribed circle (ie center to vertex)
  private rows: number = 0;
  private cols: number = 0;

  public generateMaze(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number
  ): { imageData: ImageData, pathMap: PathMap } {
    // Calculate hex dimensions based on width (distance between parallel sides)
    const hexWidth = this.hexSize * 2;  // hexSize is radius to vertex
    const hexHeight = hexWidth * Math.sqrt(3)/2;
    
    // Calculate number of complete hexagons that fit
    this.cols = Math.floor((cw - this.hexSize * 4) / hexWidth);
    this.rows = Math.floor((ch - this.hexSize * 4) / (hexHeight * 3/4));
    
    // Calculate exact padding to center the maze
    const actualWidth = this.cols * hexWidth + hexWidth/2;
    const actualHeight = this.rows * (hexHeight * 3/4) + hexHeight/3;
    const horizontalPadding = (cw - actualWidth) / 2;
    const verticalPadding = (ch - actualHeight) / 2;

    // Set canvas size
    ctx.canvas.width = cw;
    ctx.canvas.height = ch;

    // Fill background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, cw, ch);

    // Initialize grid with adjusted padding
    this.initializeGrid(horizontalPadding, verticalPadding);
    this.generateMazePaths(this.grid[0][0]);
    
    // Render the maze with adjusted border
    this.renderMaze(ctx, horizontalPadding, verticalPadding);
    
    // Create path map
    const pathMap: PathMap = {
      cells: this.grid.flat().map(cell => ({
        position: {
          row: cell.row,
          col: cell.col,
          x: cell.x,
          y: cell.y
        },
        openPaths: cell.walls
          .map((wall, index) => wall ? -1 : index)
          .filter(index => index !== -1)
      })),
      dimensions: {
        rows: this.rows,
        cols: this.cols,
        hexWidth: hexWidth,
        hexHeight: hexHeight,
        padding: {
          horizontal: horizontalPadding,
          vertical: verticalPadding
        }
      }
    };
    
    return {
      imageData: ctx.getImageData(0, 0, cw, ch),
      pathMap
    };
  }

  private initializeGrid(horizontalPadding: number, verticalPadding: number) {
    this.grid = [];
    
    // Hexagon geometry constants - based on width
    const width = this.hexSize * 2;  // Distance between parallel sides
    const height = width * Math.sqrt(3)/2;  // Distance between vertices
    
    // Spacing between hexagons
    const colSpacing = width;
    const rowSpacing = height * 3/4;  // Vertical overlap for tight packing
    
    // Create cells
    for (let row = 0; row < this.rows; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.cols; col++) {
        // Calculate center position for each hexagon
        const x = horizontalPadding + col * colSpacing + (row % 2) * (width / 2) + width/2;
        const y = verticalPadding + row * rowSpacing + height/2;
        
        this.grid[row][col] = {
          x,
          y,
          row,
          col,
          visited: false,
          walls: [true, true, true, true, true, true],  // [NE, E, SE, SW, W, NW]
          neighbors: []
        };
      }
    }

    // Connect neighbors
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        this.connectNeighbors(this.grid[row][col]);
      }
    }
  }

  private connectNeighbors(cell: HexCell) {
    const directions = [
      [-1, 0 + (cell.row % 2)],  // NE
      [0, 1],                     // E
      [1, 0 + (cell.row % 2)],   // SE
      [1, -1 + (cell.row % 2)],  // SW
      [0, -1],                    // W
      [-1, -1 + (cell.row % 2)]  // NW
    ];

    cell.neighbors = [];
    
    directions.forEach(([dRow, dCol], index) => {
      const newRow = cell.row + dRow;
      const newCol = cell.col + dCol;
      
      if (this.isValidCell(newRow, newCol)) {
        cell.neighbors[index] = this.grid[newRow][newCol];
      } else {
        cell.neighbors[index] = null;
      }
    });
  }

  private isValidCell(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  private generateMazePaths(startCell: HexCell) {
    const stack: HexCell[] = [startCell];
    startCell.visited = true;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const unvisitedNeighbors = current.neighbors
        .map((n, i) => n ? { neighbor: n, direction: i } : null)
        .filter((item): item is { neighbor: HexCell; direction: number } => 
          item !== null && !item.neighbor.visited
        );

      if (unvisitedNeighbors.length === 0) {
        stack.pop();
        continue;
      }

      const {neighbor, direction} = unvisitedNeighbors[
        Math.floor(Math.random() * unvisitedNeighbors.length)
      ];

      // Remove walls between current cell and chosen neighbor
      current.walls[direction] = false;
      neighbor.walls[(direction + 3) % 6] = false;

      // Randomly remove additional walls (30% chance)
      if (Math.random() < 0.3) {
        const otherWalls = current.walls.map((_, i) => i).filter(i => i !== direction);
        const randomWall = otherWalls[Math.floor(Math.random() * otherWalls.length)];
        if (current.neighbors[randomWall]) {
          current.walls[randomWall] = false;
          current.neighbors[randomWall]!.walls[(randomWall + 3) % 6] = false;
        }
      }

      neighbor.visited = true;
      stack.push(neighbor);
    }
  }

  private renderMaze(ctx: CanvasRenderingContext2D, horizontalPadding: number, verticalPadding: number) {
    // Draw the maze cells
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        this.drawCell(ctx, this.grid[row][col]);
      }
    }

    // Draw border wall aligned with hexagon vertices
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(horizontalPadding, verticalPadding);
    ctx.lineTo(ctx.canvas.width - horizontalPadding, verticalPadding);
    ctx.lineTo(ctx.canvas.width - horizontalPadding, ctx.canvas.height - verticalPadding);
    ctx.lineTo(horizontalPadding, ctx.canvas.height - verticalPadding);
    ctx.closePath();
    ctx.stroke();
  }

  private drawCell(ctx: CanvasRenderingContext2D, cell: HexCell) {
    // Starting angle (30 degrees or π/6 radians)
    const startAngle = Math.PI / 6;
    const points = [];
    
    // Calculate vertices
    for (let i = 0; i < 6; i++) {
      const angle = startAngle + (i * Math.PI / 3);
      points.push({
        x: cell.x + this.hexSize * Math.cos(angle),
        y: cell.y + this.hexSize * Math.sin(angle)
      });
    }
    
    // Draw walls
    for (let i = 0; i < 6; i++) {
      if (cell.walls[i]) {
        const start = points[i];
        const end = points[(i + 1) % 6];
        
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    }
  }
}