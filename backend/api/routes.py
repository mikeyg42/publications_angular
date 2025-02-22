# backend/src/api/routes.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.solver.maze_solver import MazeSolver
from backend.models import (
    LargeMazeData,
    SolutionResponse,
    ErrorResponse,
    Component
)

router = APIRouter()
solver = MazeSolver()

@router.post("/solve")
async def solve_maze(data: Component):
    result = solver.solve(data.adjacency_list)
    return SolutionResponse(
        type="solution",
        data=[result]
    )

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            try:
                data = await websocket.receive_json()
                maze_data = LargeMazeData(**data)
                await solver.solve_maze(maze_data, websocket)
            except ValueError as ve:
                error_response = ErrorResponse(
                    type="error",
                    error=str(ve)
                )
                await websocket.send_json(error_response.model_dump())
            except Exception as e:
                error_response = ErrorResponse(
                    type="error",
                    error=f"Internal error: {str(e)}"
                )
                await websocket.send_json(error_response.model_dump())
    except WebSocketDisconnect:
        # Handle client disconnect gracefully
        print("Client disconnected")