# backend/maze_solver.py
import networkx as nx
from typing import List, Dict
from fastapi import WebSocket
from maze_utils import find_longest_path
import matplotlib.pyplot as plt
from .models import (
    LargeMazeData,
    SolutionResponse,
    ErrorResponse
)

class MazeSolver:
    def __init__(self):
        self.graph = None
        self.embedding = None
        self.image_counter = 0   # for naming image files uniquely

    def convert_to_edge_list(self, adjacency_dict: Dict[str, List[str]]) -> List[tuple[str, str]]:
        edges = []
        for node, neighbors in adjacency_dict.items():
            for neighbor in neighbors:
                if (neighbor, node) not in edges:  # Avoid duplicates
                    edges.append((node, neighbor))
        return edges

    async def solve_component(self, component: Dict[str, List[str]]) -> List[str]:
        edges = self.convert_to_edge_list(component)
        return find_longest_path(edges)

    async def solve_maze(self, data: LargeMazeData, websocket: WebSocket):
        try:
            # parse the components 
            components = data.largeComponents

            solutions = []
            for component in components:
                if not component.adjacency_list:  # Using Pydantic model's attribute
                    raise ValueError("Component missing 'adjacency_list'")

                adjacency_dict = component.adjacency_list
                solution = await self.solve_component(adjacency_dict)

                if not self.verify_solution(adjacency_dict, solution):
                    raise ValueError("Solution returned but is invalid: {}".format(solution))

                solutions.append(solution)
                # Save the path visualization
                self.visualize_path(adjacency_dict, solution)

            # Send final solution using SolutionResponse model
            await websocket.send_json(
                SolutionResponse(
                    type="solution",
                    data=solutions
                ).model_dump()
            )

        except Exception as e:
            await websocket.send_json(
                ErrorResponse(
                    type="error",
                    error=str(e)
                ).model_dump()
            )

    @staticmethod
    def verify_solution(
        adjacency_dict: Dict[str, List[str]],
        path: List[str]
    ) -> bool:
        """Verify the solution is valid"""
        G = nx.Graph()
        for node, neighbors in adjacency_dict.items():
            for neigh in neighbors:
                G.add_edge(node, neigh)

        # Check path is connected
        for i in range(len(path) - 1):
            if not G.has_edge(path[i], path[i + 1]):
                return False

        # Check path visits each vertex at most once
        if len(set(path)) != len(path):
            return False

        return True

    def visualize_path(
        self,
        adjacency_dict: Dict[str, List[str]],
        path: List[str]
    ) -> None:
        """
        Draws the graph and highlights the path in red, 
        then saves it to a .png in the current folder.
        """
        # 1) Create the graph
        G = nx.Graph()
        for node, neighbors in adjacency_dict.items():
            for neigh in neighbors:
                G.add_edge(node, neigh)

        # 2) Layout
        pos = nx.spring_layout(G)

        # 3) Draw base
        nx.draw(
            G,
            pos,
            with_labels=True,
            node_size=500,
            node_color="lightblue",
            edge_color="gray"
        )

        # 4) Highlight the path
        path_edges = [(path[i], path[i + 1]) for i in range(len(path) - 1)]
        nx.draw_networkx_edges(
            G,
            pos,
            edgelist=path_edges,
            edge_color="red",
            width=2.5
        )

        # 5) Save figure
        # Build a filename, e.g. "graph_path_1.png"
        self.image_counter += 1
        filename = f"graph_path_{self.image_counter}.png"
        plt.title(f"Graph Visualization with Path {self.image_counter}")
        plt.savefig(filename, dpi=150)
        plt.close()  # close to free memory