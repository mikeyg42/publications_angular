// hex-maze.component.ts
import {
  Component,
  HostListener,
  ViewChild,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { MazeSolverService } from './maze-solver.service';
import { MazeApiService } from './maze-api.service';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { PathMap } from './maze-generator.service';

@Component({
  selector: 'app-hex-maze',
  templateUrl: './hex-maze.component.html',
  styleUrls: ['./hex-maze.component.scss'],
  standalone: true,
  imports: [CommonModule],
  providers: [MazeSolverService, MazeApiService],
})

export class HexMazeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  canvasWidth!: number;
  canvasHeight!: number;

  public isLoading: boolean = false;
  public isAnimating: boolean = false;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private pathMap?: PathMap;

  constructor(
    private mazeSolverService: MazeSolverService,
    private mazeApiService: MazeApiService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}
  
  async ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.ctx = this.canvas.nativeElement.getContext('2d', { willReadFrequently: true })!;
      this.adjustCanvasSize();
      this.testCanvasRendering();  // Test canvas rendering
      await this.generateMaze();
    }
  }

  ngOnDestroy() {

    // Cancel any pending animation frames
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    // Clear any existing timeout
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    // Set a new timeout
    this.resizeTimeout = setTimeout(() => {
      if (isPlatformBrowser(this.platformId)) {
        this.adjustCanvasSize();
        this.generateMaze();
      }
    }, 250);
  }

  adjustCanvasSize() {
    if (isPlatformBrowser(this.platformId)) {
      this.canvasWidth = window.innerWidth;
      this.canvasHeight = window.innerHeight;
      this.canvas.nativeElement.width = this.canvasWidth;
      this.canvas.nativeElement.height = this.canvasHeight;
    }
  }

  async onClick() {
    if (this.isAnimating || this.isLoading) return;
    
    try {
      this.isLoading = true;
      await this.generateMaze();
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isLoading = false;
    }
  }

  async generateMaze() {
    if (this.isAnimating) return;
    
    try {
      this.isLoading = true;
      console.log('Starting maze generation...');

      // Get maze data from API
      const dimensions = `${this.canvasWidth}x${this.canvasHeight}`;
      console.log('Requesting maze with dimensions:', dimensions);
      
      const cachedMazeData = await firstValueFrom(this.mazeApiService.getCachedMaze(dimensions));
      console.log('Cached maze data:', cachedMazeData);

      let mazeData;
      if (cachedMazeData) {
        console.log('Using cached maze');
        mazeData = cachedMazeData;
      } else {
        console.log('Generating new maze');
        mazeData = await firstValueFrom(
          this.mazeApiService.getMazeData(this.canvasWidth, this.canvasHeight)
        );
        console.log('New maze data:', mazeData);
      }

      // Render maze and store path data
      this.renderMazeFromData(mazeData);
      this.isLoading = false;
      
      // Optionally auto-solve
      await this.solveMaze();

    } catch (error) {
      console.error('Error in generateMaze:', error);
      this.handleError(error);
    }
  }

  private renderMazeFromData(mazeData: { imageData: ImageData; pathMap: PathMap }) {
    console.log('Rendering maze data:', mazeData);
    
    if (!mazeData || !mazeData.imageData || !mazeData.pathMap) {
      console.error('Invalid maze data received');
      return;
    }

    try {
      // Store the path map for solving
      this.pathMap = mazeData.pathMap;
      
      // Clear and render the maze
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.ctx.putImageData(mazeData.imageData, 0, 0);
    } catch (error) {
      console.error('Error rendering maze:', error);
    }
  }
  
  async solveMaze() {
    if (!this.pathMap) {
      console.error('No path map available');
      return;
    }

    this.isAnimating = true;
    try {
      await this.mazeSolverService.solveMaze(
        this.ctx,
        this.canvasWidth,
        this.canvasHeight,
        this.pathMap
      );
    } finally {
      this.isAnimating = false;
    }
  }

  private handleError(error: any) {
    console.error('Maze generation error:', error);
    this.isLoading = false;
    this.isAnimating = false;
  }

  // Add this method for testing
  private testCanvasRendering() {
    if (!this.ctx) return;
    
    // Clear canvas
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    
    // Draw a test pattern
    this.ctx.strokeStyle = 'black';
    this.ctx.lineWidth = 2;
    
    // Draw a hexagon
    this.ctx.beginPath();
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    const size = 50;
    
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = centerX + size * Math.cos(angle);
      const y = centerY + size * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.closePath();
    this.ctx.stroke();
  }
}
