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
  preloadedMazeData: ImageData | null = null;

  public isLoading: boolean = false;
  public isAnimating: boolean = false;
  private ctx!: CanvasRenderingContext2D;
  private resizeTimeout: any;
  private animationFrameId: number | null = null;

  constructor(
    private mazeSolverService: MazeSolverService,
    private mazeApiService: MazeApiService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}
  
  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.ctx = this.canvas.nativeElement.getContext('2d')!;
      this.adjustCanvasSize();
      this.generateMaze();
    }
  }

  ngOnDestroy() {
    // Clear the resize timeout if it exists
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    // Cancel any pending animation frames
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
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
      this.adjustCanvasSize();
      this.generateMaze();
    }, 250); // Wait 250ms after the last resize event before executing
  }

  adjustCanvasSize() {
    this.canvasWidth = window.innerWidth;
    this.canvasHeight = window.innerHeight;
    this.canvas.nativeElement.width = this.canvasWidth;
    this.canvas.nativeElement.height = this.canvasHeight;
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
      // Get maze data from API
      const dimensions = `${this.canvasWidth}x${this.canvasHeight}`;
      const mazeData = await firstValueFrom(this.mazeApiService.getCachedMaze(dimensions));

      if (mazeData) {
        // Use cached maze
        this.renderMazeFromData(mazeData);
      } else {
        // Generate new maze
        const newMazeData = await firstValueFrom(
          this.mazeApiService.getMazeData(this.canvasWidth, this.canvasHeight)
        );
        this.renderMazeFromData(newMazeData);
      }

      await this.solveMaze();
      this.preloadNextMaze();
    } catch (error) {
      this.handleError(error);
    }
  }

  private renderMazeFromData(mazeData: any) {
    const imageData = new ImageData(
      new Uint8ClampedArray(mazeData.pixels),
      this.canvasWidth,
      this.canvasHeight
    );
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  async solveMaze() {
    // Start the maze solving and animation
    this.isAnimating = true;
    try {
      await this.mazeSolverService.solveMaze(
        this.ctx,
        this.canvasWidth,
        this.canvasHeight
      );
    } finally {
      this.isAnimating = false;
    }
  }

  preloadNextMaze() {
    const worker = new Worker(
      new URL('./maze-preload.worker', import.meta.url),
      { type: 'module' }
    );

    worker.postMessage({ width: this.canvasWidth, height: this.canvasHeight });

    worker.onmessage = (event) => {
      this.preloadedMazeData = event.data.imageData;
      worker.terminate();
    };

    worker.onerror = (error) => {
      console.error('Preload worker error:', error);
      worker.terminate();
    };
  }

  private handleError(error: any) {
    console.error('Maze generation error:', error);
    // Show user-friendly error message
    this.isLoading = false;
    this.isAnimating = false;
  }
}
