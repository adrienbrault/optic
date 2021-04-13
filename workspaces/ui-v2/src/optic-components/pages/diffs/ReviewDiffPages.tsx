import * as React from 'react';
import { NavigationRoute } from '../../navigation/NavigationRoute';
import {
  useDiffEnvironmentsRoot,
  useDiffForEndpointLink,
  useDiffReviewPageLink,
  useDiffReviewPagePendingEndpoint,
  useDiffUndocumentedUrlsPageLink,
} from '../../navigation/Routes';
import { ContributionEditingStore } from '../../hooks/edit/Contributions';
import { SharedDiffStore } from '../../hooks/diffs/SharedDiffContext';
import { PendingEndpointPageSession } from './PendingEndpointPage';
import { DiffUrlsPage } from './AddEndpointsPage';
import { Route, Redirect } from 'react-router-dom';
import { ReviewEndpointDiffPage } from './ReviewEndpointDiffPage';
import { DiffAccessoryNavigation } from '../../diffs/DiffAccessoryNavigation';
import { DiffEnvsPage } from './DiffEnvsPage';
import { useDiffsForCapture } from '../../hooks/useDiffForCapture';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAllRequestsAndResponses } from '../../hooks/diffs/useAllRequestsAndResponses';
import { useEndpoints } from '../../hooks/useEndpointsHook';

export function DiffReviewPages(props: any) {
  const { match } = props;
  const { environment, boundaryId } = match.params;
  const [diffId] = useState(uuidv4());

  //dependencies
  const diff = useDiffsForCapture(boundaryId, diffId);
  const allRequestsAndResponsesOfBaseSpec = useAllRequestsAndResponses();
  const allEndpointsOfBaseSpec = useEndpoints();

  //@dev: useCapture(boundaryId)
  //@dev: useDiff(diffId, boundaryId)
  // returns loading until diff is done
  // DiffContext.Provider value={{...}}

  const diffUndocumentedUrlsPageLink = useDiffUndocumentedUrlsPageLink();
  const diffForEndpointLink = useDiffForEndpointLink();
  const diffReviewPagePendingEndpoint = useDiffReviewPagePendingEndpoint();

  const isLoading =
    diff.loading ||
    allEndpointsOfBaseSpec.loading ||
    allRequestsAndResponsesOfBaseSpec.loading;

  if (isLoading) {
    return <div>LOADING</div>;
  }

  return (
    <SharedDiffStore
      diffs={diff.diffs}
      urls={diff.urls}
      endpoints={allEndpointsOfBaseSpec.endpoints}
      requests={allRequestsAndResponsesOfBaseSpec.data?.requests!}
      responses={allRequestsAndResponsesOfBaseSpec.data?.responses!}
    >
      <ContributionEditingStore initialIsEditingState={true}>
        <NavigationRoute
          path={diffUndocumentedUrlsPageLink.path}
          Component={DiffUrlsPage}
          AccessoryNavigation={() => (
            <DiffAccessoryNavigation onUrlsPage={true} />
          )}
        />
        <NavigationRoute
          path={diffForEndpointLink.path}
          Component={ReviewEndpointDiffPage}
          AccessoryNavigation={() => <DiffAccessoryNavigation />}
        />
        <NavigationRoute
          path={diffReviewPagePendingEndpoint.path}
          Component={PendingEndpointPageSession}
          AccessoryNavigation={() => (
            <DiffAccessoryNavigation onUrlsPage={true} />
          )}
        />
        <Redirect to={diffUndocumentedUrlsPageLink.linkTo()} />
      </ContributionEditingStore>
    </SharedDiffStore>
  );
}

export function DiffReviewEnvironments(props: any) {
  const diffRoot = useDiffReviewPageLink();
  const diffEnvironmentsRoot = useDiffEnvironmentsRoot();
  return (
    <>
      <NavigationRoute
        path={diffRoot.path}
        Component={DiffEnvsPage}
        AccessoryNavigation={null}
      />
      <Route path={diffEnvironmentsRoot.path} component={DiffReviewPages} />
    </>
  );
}
