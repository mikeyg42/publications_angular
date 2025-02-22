use pyo3::prelude::*;
use pyo3::wrap_pyfunction;

// Bring in the code from maze_utils.rs
mod maze_utils;

/// A Python module implemented in Rust.
#[pymodule]
fn maze_util_lib(_py: Python<'_>, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(maze_utils::find_longest_path, m)?)?;
    Ok(())
}