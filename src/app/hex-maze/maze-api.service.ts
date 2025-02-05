import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MazeGeneratorService } from './maze-generator.service';

@Injectable({
  providedIn: 'root'
})
export class MazeApiService {
  constructor(private mazeGeneratorService: MazeGeneratorService) {}

  getMazeData(width: number, height: number): Observable<any> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const mazeData = this.mazeGeneratorService.generateMaze(ctx, width, height);
    return of(mazeData);
  }

  getCachedMaze(dimensions: string): Observable<any> {
    // Implement local caching if needed, or return null
    return of(null);
  }
}