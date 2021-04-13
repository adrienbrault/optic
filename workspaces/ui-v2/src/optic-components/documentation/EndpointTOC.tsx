import * as React from 'react';
import makeStyles from '@material-ui/styles/makeStyles';
import { getReasonPhrase } from 'http-status-codes';
import { List, ListItem, Typography } from '@material-ui/core';
import { SubtleGreyBackground } from '../theme';
import { IRequestBody, IResponseBody } from '../hooks/useEndpointBodyHook';
import { goToAnchor } from '../utilities/go-to-anchor';

export type EndpointTOCProps = {
  requests: IRequestBody[];
  responses: IResponseBody[];
};

function Code({ value }: { value: string }) {
  return (
    <span
      style={{
        backgroundColor: SubtleGreyBackground,
        paddingLeft: 4,
        paddingRight: 4,
      }}
    >
      {value}
    </span>
  );
}

export function EndpointTOC(props: EndpointTOCProps) {
  const classes = useStyles();

  return (
    <List dense>
      {props.requests.length === 0 && props.responses.length === 0 ? (
        <Typography className={classes.none}>No bodies documented.</Typography>
      ) : null}

      {props.requests.map((body, index) => {
        return (
          <EndpointTOCRow
            key={index}
            label={'Request Body'}
            anchorLink={body.requestId}
            detail={
              <>
                consumes <Code value={body.contentType} />
              </>
            }
          />
        );
      })}

      {props.responses.map((body, index) => {
        return (
          <EndpointTOCRow
            label={`${getReasonPhrase(body.statusCode)} - ${
              body.statusCode
            } Response`}
            anchorLink={body.responseId}
            key={index}
            detail={
              <>
                produces <Code value={body.contentType} />
              </>
            }
          />
        );
      })}
    </List>
  );
}

export type EndpointTOCRowProps = {
  label: string;
  anchorLink: string;
  detail: any;
};

export function EndpointTOCRow({
  label,
  detail,
  anchorLink,
}: EndpointTOCRowProps) {
  const classes = useStyles();

  return (
    <ListItem className={classes.row} button onClick={goToAnchor(anchorLink)}>
      <div className={classes.leftContent}>{label}</div>
      <div className={classes.rightContent}> {detail}</div>
    </ListItem>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    maxWidth: 400,
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
  },
  leftContent: {
    display: 'flex',
    alignItems: 'center',
    justifyItems: 'center',
    color: 'rgb(79, 86, 107)',
    minWidth: 130,
    fontSize: 13,
    fontWeight: 600,
    justifyContent: 'flex-end',
    paddingRight: 10,
    fontFamily: 'Ubuntu',
  },
  rightContent: {
    color: 'rgb(79, 86, 107)',
    fontSize: 13,
    flexShrink: 1,
    paddingLeft: 4,
  },
  none: {
    color: '#8792a2',
    fontSize: 12,
    paddingLeft: 10,
  },
  h6: {
    fontSize: 13,
    fontFamily: 'Ubuntu, Inter',
    fontWeight: 500,
    lineHeight: 1.6,
    marginBottom: 8,
  },
}));
