//! Software Factory domain layer (SF-2): the Story/Subtask/Release ladders and
//! the operations the Flowboard CLI and its MCP expose.

pub mod ladder;
pub mod mcp;
pub mod ops;

#[cfg(test)]
mod tests;
