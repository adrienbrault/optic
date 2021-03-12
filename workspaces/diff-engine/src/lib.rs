#![allow(dead_code, unused_imports, unused_variables)]

mod commands;
mod events;
mod interactions;
mod projections;
mod protos;
mod queries;
mod shapes;
mod spec;
mod state;

#[cfg(feature = "streams")]
pub mod streams;

pub use commands::{CommandContext, RfcCommand, SpecCommand, SpecCommandHandler};
pub use cqrs_core::Aggregate;
pub use events::{
  EventContext, HttpInteraction, RfcEvent, SpecChunkEvent, SpecEvent, WithEventContext,
};
pub use interactions::diff as diff_interaction;
pub use interactions::result::InteractionDiffResult;
pub use projections::{
  EndpointProjection, ShapeProjection, SpecAssemblerProjection, SpecProjection,
};
pub use protos::shapehash;
pub use shapes::diff as diff_shape;
pub use spec::append_batch as append_batch_to_spec;
pub use state::body::BodyDescriptor;

pub mod errors {
  pub use super::events::EventLoadingError;

  #[cfg(feature = "streams")]
  pub use super::streams::spec_chunks::{SpecChunkLoaderError, SpecChunkWriterError};
}
