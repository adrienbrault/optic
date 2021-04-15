use super::events_from_chunks;

use clap::{App, Arg, ArgGroup, ArgMatches, SubCommand};
use futures::{try_join, Stream, StreamExt, TryStreamExt};
use nanoid::nanoid;
use serde::Serialize;
use serde_json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{stdin, stdout, AsyncWrite};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use optic_diff_engine::streams;
use optic_diff_engine::{analyze_undocumented_bodies, EndpointCommand, SpecCommand};
use optic_diff_engine::{
  BodyAnalysisLocation, HttpInteraction, SpecChunkEvent, SpecEvent, SpecIdGenerator,
  SpecProjection, TrailObservationsResult,
};

pub const SUBCOMMAND_NAME: &'static str = "learn";

pub fn create_subcommand<'a, 'b>() -> App<'a, 'b> {
  SubCommand::with_name(SUBCOMMAND_NAME)
    .about("Learns about possible changes to the spec based on interactions or diffs")
    .arg(
      Arg::with_name("undocumented-bodies")
        .long("undocumented-bodies")
        .takes_value(false)
        .help("Learn shapes of undocumented bodies from interactions piped to stdin"),
    )
    .arg(
      Arg::with_name("shape-diffs")
        .long("shape-diffs")
        .takes_value(false)
        .help("Learn updated shapes from shape diffs piped to stdin"),
    )
    .group(
      ArgGroup::with_name("subject")
        .args(&["undocumented-bodies", "shape-diffs"])
        .multiple(false)
        .required(true),
    )
}

pub async fn main<'a>(
  command_matches: &'a ArgMatches<'a>,
  spec_chunks: Vec<SpecChunkEvent>,
  input_queue_size: usize,
) {
  let spec_events = events_from_chunks(spec_chunks).await;

  if command_matches.is_present("undocumented-bodies") {
    let stdin = stdin();
    let interaction_lines = streams::http_interaction::json_lines(stdin);
    let sink = stdout();

    learn_undocumented_bodies(spec_events, input_queue_size, interaction_lines, sink).await;
  } else if command_matches.is_present("shape-diffs") {
    todo!("shape diffs learning is yet to be implemented");
  } else {
    unreachable!("subject is required");
  }
}

async fn learn_undocumented_bodies<S: 'static + AsyncWrite + Unpin + Send>(
  spec_events: Vec<SpecEvent>,
  input_queue_size: usize,
  interaction_lines: impl Stream<Item = Result<String, std::io::Error>>,
  sink: S,
) {
  let spec_projection = Arc::new(SpecProjection::from(spec_events));

  let (analysis_sender, analysis_receiver) = mpsc::channel(32);

  let analyzing_bodies = async move {
    let analyze_results = interaction_lines
      .map(Ok)
      .try_for_each_concurrent(input_queue_size, |interaction_json_result| {
        let projection = spec_projection.clone();
        let analysis_sender = analysis_sender.clone();

        let analyze_task = tokio::spawn(async move {
          let analyze_comp = tokio::task::spawn_blocking(move || {
            let interaction_json =
              interaction_json_result.expect("can rad interaction json line form stdin");

            let interaction: HttpInteraction =
              serde_json::from_str(&interaction_json).expect("could not parse interaction json");

            analyze_undocumented_bodies(&projection, interaction)
          });

          match analyze_comp.await {
            Ok(results) => {
              for result in results {
                analysis_sender
                  .send(result)
                  .await
                  .expect("could not send analysis result to aggregation channel")
              }
            }
            Err(err) => {
              // ignore a single interaction not being able to deserialize
              eprintln!("interaction ignored: {}", err);
            }
          }
        });

        analyze_task
      })
      .await;

    analyze_results
  };

  let aggregating_results = tokio::spawn(async move {
    let mut analysiss = ReceiverStream::new(analysis_receiver);
    let mut id_generator = IdGenerator::default();

    let mut observations_by_body_location = HashMap::new();
    while let Some(analysis) = analysiss.next().await {
      let existing_observations = observations_by_body_location
        .entry(analysis.body_location)
        .or_insert_with(|| TrailObservationsResult::default());

      existing_observations.union(analysis.trail_observations);
    }

    let mut endpoints_by_endpoint = HashMap::new();
    for (body_location, observations) in observations_by_body_location {
      let (root_shape_id, body_commands) = observations.into_commands(&mut id_generator);
      let endpoint_body = EndpointBody::new(&body_location, root_shape_id, body_commands);

      let (path_id, method) = match body_location {
        BodyAnalysisLocation::Request {
          path_id, method, ..
        } => (path_id, method),
        BodyAnalysisLocation::Response {
          path_id, method, ..
        } => (path_id, method),
      };

      let endpoint_bodies = endpoints_by_endpoint
        .entry((path_id, method))
        .or_insert_with_key(|(path_id, method)| {
          EndpointBodies::new(path_id.clone(), method.clone())
        });

      endpoint_bodies.push(endpoint_body);
    }

    streams::write_to_json_lines(sink, endpoints_by_endpoint.values())
      .await
      .expect("could not write endpoint bodies to stdout");
  });

  try_join!(analyzing_bodies, aggregating_results).expect("essential worker task panicked");
}

#[derive(Debug, Default)]
struct IdGenerator;

impl SpecIdGenerator for IdGenerator {
  fn generate_id(&mut self, prefix: &str) -> String {
    // NanoID @ 10 chars:
    // - URL-safe,
    // - 17 years for a 1% chance of at least one global collision assuming
    //   writing 1000 ids per hour (https://zelark.github.io/nano-id-cc/)
    format!("{}{}", prefix, nanoid!(10))
  }
}

#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EndpointBodies {
  path_id: String,
  method: String,
  requests: Vec<EndpointRequestBody>,
  responses: Vec<EndpointResponseBody>,
}

impl EndpointBodies {
  pub fn new(path_id: String, method: String) -> Self {
    Self {
      path_id,
      method,
      requests: vec![],
      responses: vec![],
    }
  }

  pub fn push(&mut self, endpoint: EndpointBody) {
    match endpoint {
      EndpointBody::Request(endpoint_request) => {
        self.requests.push(endpoint_request);
      }
      EndpointBody::Response(endpoint_response) => {
        self.responses.push(endpoint_response);
      }
    }
  }
}

#[derive(Debug)]
enum EndpointBody {
  Request(EndpointRequestBody),
  Response(EndpointResponseBody),
}

#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EndpointRequestBody {
  commands: Vec<SpecCommand>,

  #[serde(skip)]
  path_id: String,
  #[serde(skip)]
  method: String,

  #[serde(flatten)]
  body_descriptor: Option<EndpointBodyDescriptor>,
}

#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EndpointResponseBody {
  commands: Vec<SpecCommand>,
  status_code: u16,

  #[serde(skip)]
  path_id: String,
  #[serde(skip)]
  method: String,

  #[serde(flatten)]
  body_descriptor: Option<EndpointBodyDescriptor>,
}

#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EndpointBodyDescriptor {
  content_type: String,
  root_shape_id: String,
}

impl EndpointBody {
  fn new(
    body_location: &BodyAnalysisLocation,
    root_shape_id: Option<String>,
    body_commands: impl IntoIterator<Item = SpecCommand>,
  ) -> Self {
    let body_descriptor = match root_shape_id {
      Some(root_shape_id) => Some(EndpointBodyDescriptor {
        content_type: body_location
          .content_type()
          .expect("root shape id implies a content type to be present")
          .clone(),
        root_shape_id,
      }),
      None => None,
    };

    let mut body = match body_location {
      BodyAnalysisLocation::Request {
        path_id, method, ..
      } => EndpointBody::Request(EndpointRequestBody {
        body_descriptor,
        path_id: path_id.clone(),
        method: method.clone(),
        commands: body_commands.into_iter().collect(),
      }),
      BodyAnalysisLocation::Response {
        status_code,
        path_id,
        method,
        ..
      } => EndpointBody::Response(EndpointResponseBody {
        body_descriptor,
        path_id: path_id.clone(),
        method: method.clone(),
        commands: body_commands.into_iter().collect(),
        status_code: *status_code,
      }),
    };

    body.append_endpoint_commands();

    body
  }

  fn append_endpoint_commands(&mut self) {
    let mut ids = IdGenerator::default();

    match self {
      EndpointBody::Request(request_body) => {
        let request_id = ids.request();
        request_body
          .commands
          .push(SpecCommand::from(EndpointCommand::add_request(
            request_id.clone(),
            request_body.path_id.clone(),
            request_body.method.clone(),
          )));

        if let Some(body_descriptor) = &request_body.body_descriptor {
          request_body
            .commands
            .push(SpecCommand::from(EndpointCommand::set_request_body_shape(
              request_id,
              body_descriptor.root_shape_id.clone(),
              body_descriptor.content_type.clone(),
              false,
            )));
        }
      }
      EndpointBody::Response(response_body) => {
        let response_id = ids.response();
        response_body.commands.push(SpecCommand::from(
          EndpointCommand::add_response_by_path_and_method(
            response_id.clone(),
            response_body.path_id.clone(),
            response_body.method.clone(),
            response_body.status_code.clone(),
          ),
        ));

        if let Some(body_descriptor) = &response_body.body_descriptor {
          response_body
            .commands
            .push(SpecCommand::from(EndpointCommand::set_response_body_shape(
              response_id,
              body_descriptor.root_shape_id.clone(),
              body_descriptor.content_type.clone(),
              false,
            )));
        }
      }
    };
  }
}

#[cfg(test)]
mod test {
  use super::*;
  use serde_json::json;

  #[tokio::main]
  #[test]
  async fn can_learn_endpoint_bodies_from_interactions() {
    let spec_events: Vec<SpecEvent> = serde_json::from_value(json!([
      {"PathComponentAdded":{"pathId":"path_id_1","parentPathId":"root","name":"todos"}}
    ]))
    .expect("initial spec events should be valid events");

    // TODO: feed actual interactions and assert the output
    let interaction_lines = streams::http_interaction::json_lines(tokio::io::empty());
    let sink = tokio::io::sink();

    learn_undocumented_bodies(spec_events, 1, interaction_lines, sink).await;
  }
}
