import { graphql } from 'graphql';
import { schema } from './graphql/schema';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { shapes, endpoints } from '@useoptic/graph-lib';


export interface IOpticContext {
  specEvents: any[];
  endpointChanges: any;
}

function buildEndpointsGraph(spec: any, opticEngine: any) {
  const serializedGraph = JSON.parse(opticEngine.get_endpoints_projection(spec));
  const {
    nodes, edges, nodeIndexToId
  } = serializedGraph;

  console.log(serializedGraph)

  const indexer = new endpoints.GraphIndexer();

  function remapId(arrayIndex: number) {
    const fallbackId = arrayIndex.toString();
    const id = nodeIndexToId[fallbackId];
    if (id !== undefined) {
      return id;
    }
    return fallbackId;
  }

  nodes.forEach((node: endpoints.Node, index: number) => {
    const id = remapId(index);
    indexer.addNode({
      ...node,
      id
    });
  });
  edges.forEach((e: [number, number, any]) => {
    const [sourceIndex, targetIndex, edge] = e;
    indexer.addEdge(edge, remapId(sourceIndex), remapId(targetIndex));
  });
  const queries = new endpoints.GraphQueries(indexer);
  return queries;
}

function buildShapesGraph(spec: any, opticEngine: any) {
  const serializedGraph = JSON.parse(opticEngine.get_shapes_projection(spec));
  const {
    nodes, edges, nodeIndexToId
  } = serializedGraph;

  const indexer = new shapes.GraphIndexer();

  function remapId(arrayIndex: number) {
    const fallbackId = arrayIndex.toString();
    const id = nodeIndexToId[fallbackId];
    if (id !== undefined) {
      return id;
    }
    return fallbackId;
  }

  nodes.forEach((node: shapes.Node, index: number) => {
    const id = remapId(index);
    indexer.addNode({
      ...node,
      id
    });
  });
  edges.forEach((e: [number, number, any]) => {
    const [sourceIndex, targetIndex, edge] = e;
    indexer.addEdge(edge, remapId(sourceIndex), remapId(targetIndex));
  });
  const queries = new shapes.GraphQueries(indexer);
  return queries;
}

export function makeSpectacle(opticEngine: any, opticContext: IOpticContext) {
  const spec = opticEngine.spec_from_events(
    JSON.stringify(opticContext.specEvents)
  );

  const endpointsQueries = buildEndpointsGraph(spec, opticEngine);
  const shapeViewerProjection = JSON.parse(opticEngine.get_shape_viewer_projection(spec));
  // console.log({ shapeViewerProjection });

  const resolvers = {
    Query: {
      requests: (parent: any, args: any, context: any, info: any) => {
        return Promise.resolve(context.endpointsQueries.listNodesByType(endpoints.NodeType.Request).results);
      },
      shapeChoices: (parent: any, args: any, context: any, info: any) => {
        return Promise.resolve(context.shapeViewerProjection[args.shapeId]);
      },
      endpointChanges: (parent: any, args: any, context: any, info: any) => {
        return Promise.resolve(context.opticContext.endpointChanges)
      },
      batchCommits:  (parent: any, args: any, context: any, info: any) => {
        return Promise.resolve(context.endpointsQueries.listNodesByType(endpoints.NodeType.BatchCommit).results);
      }
    },
    HttpRequest: {
      id: (parent: any) => {
        return Promise.resolve(parent.result.data.requestId);
      },
      pathId: (parent: any) => {
        return Promise.resolve(parent.path().result.data.pathId);
      },
      absolutePathPattern: (parent: any) => {
        return Promise.resolve(parent.path().result.data.absolutePathPattern);
      },
      method: (parent: any) => {
        return Promise.resolve(parent.result.data.httpMethod);
      },
      bodies: (parent: any) => {
        return Promise.resolve(parent.bodies().results);
      },
      responses: (parent: endpoints.RequestNodeWrapper) => {
        return Promise.resolve(parent.path().responses().results);
      }
    },
    HttpResponse: {
      id: (parent: any) => {
        return Promise.resolve(parent.result.data.responseId);
      },
      statusCode: (parent: any) => {
        return Promise.resolve(parent.result.data.httpStatusCode);
      },
      bodies: (parent: any) => {
        return Promise.resolve(parent.bodies().results);
      }
    },
    HttpBody: {
      contentType: (parent: any) => {
        return Promise.resolve(parent.result.data.httpContentType);
      },
      rootShapeId: (parent: any) => {
        return Promise.resolve(parent.result.data.rootShapeId);
      }
    },
    OpticShape: {
      id: (parent: any) => {
        return Promise.resolve(parent.shapeId);
      },
      jsonType: (parent: any) => {
        return Promise.resolve(parent.jsonType);
      },
      asArray: (parent: any) => {
        if (parent.jsonType === 'Array') {
          return Promise.resolve(parent);
        }
      },
      asObject: (parent: any) => {
        if (parent.jsonType === 'Object') {
          return Promise.resolve(parent);
        }
      }
    },
    ArrayMetadata: {
      shapeId: (parent: any) => {
        return Promise.resolve(parent.itemShapeId)
      }
    },
    EndpointChanges: {
      opticUrl: (parent: any) => {
        return Promise.resolve(parent.opticUrl);
      },
      endpoints: (parent: any) => {
        return Promise.resolve(parent.endpoints);
      }
    },
    EndpointChange: {
      change: (parent: any) => {
        return Promise.resolve(parent.change);
      },
      path: (parent: any) => {
        return Promise.resolve(parent.path)
      },
      method: (parent: any) => {
        return Promise.resolve(parent.method);
      }
    },
    EndpointChangeMetadata: {
      category: (parent: any) => {
        return Promise.resolve(parent.category);
      }
    },
    BatchCommit: {
      createdAt: (parent: any) => {
        return Promise.resolve(parent.result.created_at);
      },
      batchId: (parent: any) => {
        return Promise.resolve(parent.result.batch_id);
      }
    }
  };

  const executableSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers
  });

  return function(input: SpectacleInput) {
    return graphql({
      schema: executableSchema,
      source: input.query,
      variableValues: input.variables,
      operationName: input.operationName,
      contextValue: {
        opticContext,
        endpointsQueries,
        shapeViewerProjection
      }
    });
  };
}

export interface SpectacleInput {
  query: string,
  variables: {
    [key: string]: string
  },
  operationName?: string
}
