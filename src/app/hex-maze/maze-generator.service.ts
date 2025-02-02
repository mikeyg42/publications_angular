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

@Injectable({
  providedIn: 'root',
})
export class MazeGeneratorService {
  private grid: HexCell[][] = [];
  private hexSize: number = 20;
  private rows: number = 0;
  private cols: number = 0;

  public generateMaze(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number
  ): boolean {
    try {
        // Calculate grid dimensions
      const hexHeight = this.hexSize * 2;
      const hexWidth = Math.sqrt(3) * this.hexSize;
      this.cols = Math.floor(cw / hexWidth) - 1;
      this.rows = Math.floor(ch / (hexHeight * 0.75)) - 1;

      // Initialize grid
      this.initializeGrid();
      
      // Generate maze using recursive backtracking
      this.generateMazePaths(this.grid[0][0]);
      
      // Render the maze
      this.renderMaze(ctx);
      return true;
    } catch (error) {
      console.error('Error generating maze:', error);
      return false;
    }
  }

  private initializeGrid() {
    this.grid = [];
    
    // Create cells
    for (let row = 0; row < this.rows; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.cols; col++) {
        const x = col * (Math.sqrt(3) * this.hexSize) + (row % 2) * (Math.sqrt(3) * this.hexSize / 2);
        const y = row * (this.hexSize * 1.5);
        
        this.grid[row][col] = {
          x,
          y,
          row,
          col,
          visited: false,
          walls: [true, true, true, true, true, true], // All walls initially present
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

        neighbor.visited = true;
        stack.push(neighbor);
    }
}

  private renderMaze(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        this.drawCell(ctx, this.grid[row][col]);
      }
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, cell: HexCell) {
    const angles = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3];
    
    for (let i = 0; i < 6; i++) {
      if (cell.walls[i]) {
        const startAngle = angles[i];
        const endAngle = angles[(i + 1) % 6];
        
        ctx.beginPath();
        ctx.moveTo(
          cell.x + this.hexSize * Math.cos(startAngle),
          cell.y + this.hexSize * Math.sin(startAngle)
        );
        ctx.lineTo(
          cell.x + this.hexSize * Math.cos(endAngle),
          cell.y + this.hexSize * Math.sin(endAngle)
        );
        ctx.stroke();
      }
    }
  }
}