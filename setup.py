# setup.py
from setuptools import setup, find_packages

setup(
    name="oeuvre-angular",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "uvicorn",
        "websockets",
        "pydantic",
        "maturin",
        "networkx",
        "matplotlib",
    ],
)