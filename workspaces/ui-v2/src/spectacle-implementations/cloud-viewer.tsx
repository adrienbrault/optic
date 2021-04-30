import * as React from 'react';
import { useRouteMatch, useParams, Switch } from 'react-router-dom';
import { Provider as BaseUrlProvider } from '../optic-components/hooks/useBaseUrl';
import { makeSpectacle } from '@useoptic/spectacle';
import { useEffect, useState } from 'react';
import { DocumentationPages } from '../optic-components/pages/docs/DocumentationPage';
import { AsyncStatus, SpectacleStore } from './spectacle-provider';
import { Loading } from '../optic-components/loaders/Loading';
import { DiffReviewEnvironments } from '../optic-components/pages/diffs/ReviewDiffPages';
import { InMemoryInteractionLoaderStore } from './interaction-loader';
import { IBaseSpectacle, SpectacleInput } from '@useoptic/spectacle';
import { IForkableSpectacle } from '@useoptic/spectacle';
import { InMemoryOpticContextBuilder } from '@useoptic/spectacle/build/in-memory';
import { CapturesServiceStore } from '../optic-components/hooks/useCapturesHook';
import { IOpticContext } from '@useoptic/spectacle';
import { ChangelogPages } from '../optic-components/pages/changelog/ChangelogPages';
import {
  AppConfigurationStore,
  OpticAppConfig,
} from '../optic-components/hooks/config/AppConfiguration';

const appConfig: OpticAppConfig = {
  featureFlags: {},
  config: {
    analytics: {
      enabled: false,
    },
    navigation: {
      showChangelog: true,
      showDiff: false,
      showDocs: true,
    },
    documentation: {
      allowDescriptionEditing: false,
    },
  },
};

export default function CloudViewer() {
  const match = useRouteMatch();
  const params = useParams<{ specId: string }>();
  const { specId } = params;
  const task: InMemorySpectacleDependenciesLoader = async () => {
    const loadExample = async () => {
      let apiBase = process.env.REACT_APP_API_BASE;

      if (!apiBase) {
        if (window.location.hostname.indexOf('useoptic.com')) {
          apiBase = process.env.REACT_APP_PROD_API_BASE;
        } else {
          apiBase = process.env.REACT_APP_STAGING_API_BASE;
        }
      }

      const response = await fetch(`${apiBase}/api/specs/${specId}`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`could not find spec ${specId}`);
      }
      const responseJson = await response.json();
      let signedUrl = responseJson.read_url;

      if (!signedUrl) {
        throw new Error(`No read url found: ${JSON.stringify(responseJson)}`);
      }

      let contentReq = await fetch(signedUrl);
      if (!contentReq.ok) {
        throw new Error(`Unable to fetch spec ${specId}`);
      }

      let spec = await contentReq.json();
      return spec;
    };
    const [events, opticEngine] = await Promise.all([
      loadExample(),
      import('@useoptic/diff-engine-wasm/engine/browser'),
    ]);
    return {
      events,
      samples: [],
      opticEngine,
    };
  };
  const { loading, error, data } = useInMemorySpectacle(task);
  if (loading) {
    return <Loading />;
  }
  if (error) {
    return <div>error :(</div>;
  }
  if (!data) {
    return <div>something went wrong</div>;
  }

  return (
    <AppConfigurationStore config={appConfig}>
      <SpectacleStore spectacle={data}>
        <CapturesServiceStore
          capturesService={data.opticContext.capturesService}
        >
          <InMemoryInteractionLoaderStore samples={data.samples}>
            <BaseUrlProvider value={{ url: match.url }}>
              <Switch>
                <>
                  <DiffReviewEnvironments />
                  <DocumentationPages />
                  <ChangelogPages />
                </>
              </Switch>
            </BaseUrlProvider>
          </InMemoryInteractionLoaderStore>
        </CapturesServiceStore>
      </SpectacleStore>
    </AppConfigurationStore>
  );
}

export interface InMemorySpectacleDependencies {
  events: any[];
  opticEngine: any;
  samples: any[];
}

export type InMemorySpectacleDependenciesLoader = () => Promise<InMemorySpectacleDependencies>;

class InMemorySpectacle implements IForkableSpectacle, InMemoryBaseSpectacle {
  private spectaclePromise: Promise<any>;

  constructor(
    public readonly opticContext: IOpticContext,
    public samples: any[]
  ) {
    this.spectaclePromise = makeSpectacle(opticContext);
  }

  async fork(): Promise<IBaseSpectacle> {
    const opticContext = await InMemoryOpticContextBuilder.fromEvents(
      this.opticContext.opticEngine,
      [...(await this.opticContext.specRepository.listEvents())]
    );
    return new InMemorySpectacle(opticContext, [...this.samples]);
  }

  async mutate(options: SpectacleInput): Promise<any> {
    const spectacle = await this.spectaclePromise;
    return spectacle(options);
  }

  async query(options: SpectacleInput): Promise<any> {
    const spectacle = await this.spectaclePromise;
    return spectacle(options);
  }
}

export interface InMemoryBaseSpectacle extends IBaseSpectacle {
  samples: any[];
  opticContext: IOpticContext;
}

export function useInMemorySpectacle(
  loadDependencies: InMemorySpectacleDependenciesLoader
): AsyncStatus<InMemoryBaseSpectacle> {
  const [spectacle, setSpectacle] = useState<InMemoryBaseSpectacle>();

  useEffect(() => {
    async function task() {
      const result = await loadDependencies();
      //@ts-ignore
      //for debugging only. delete me
      window.events = result.events;
      const opticContext = await InMemoryOpticContextBuilder.fromEventsAndInteractions(
        result.opticEngine,
        result.events,
        result.samples,
        'example-session'
      );
      const inMemorySpectacle = new InMemorySpectacle(
        opticContext,
        result.samples
      );
      setSpectacle(inMemorySpectacle);
    }

    task();
    // should only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (spectacle) {
    return {
      loading: false,
      data: spectacle,
      error: false,
    };
  } else {
    return {
      loading: true,
      data: null,
      error: false,
    };
  }
}
