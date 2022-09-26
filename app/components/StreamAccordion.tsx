import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';

import { makeStyles } from '@material-ui/styles';

import { Integer } from 'neo4j-driver';
import { NavLink, Link, Outlet, useParams } from "@remix-run/react";

import { redirect } from '@remix-run/server-runtime';
import { useState, useEffect } from 'react';


import CompactProfile from './CompactProfile';
import StreamConfig from './StreamConfig';


export type streamNode = {
  identity: Array<Integer>,
  labels: any[],
  properties: {
    name: string,
    startTime: string
  },
  elementId: string
}

export type userNode = {
  identity: Integer,
  labels: string[],
  properties: {
    verified: boolean,
    created_at: string,
    description: string,
    profile_image_url: string,
    'public_metrics.listed_count': Integer | null,
    url: string,
    'public_metrics.following_count': Integer | null,
    'public_metrics.followers_count': Integer | null,
    protected: Boolean,
    name: string,
    id: string,
    'public_metrics.tweet_count': Integer | null,
    username: string
  },
  elementId: string
}

// define stream type
export type Stream = {
  stream: streamNode;
  seedUsers: Array<userNode>;
  recommendedUsers: Array<userNode>;
};

const useStyles = makeStyles((theme) => ({
  root: {
    width: "100%",
    background: "white",
    flexGrow: 0,
    border: "0px"
  },
  rootExpanded: {
    background: "white",
    flexGrow: 1,
  }
}));

function StreamAccordion({ streams, lists }: { streams: Stream[] }) {

  // TODO: onOpen redirect to $streamName
  // TODO: perf should be much better when folding/unfolding streams

  const { streamName } = useParams();
  const classes = useStyles();

  return (
    <div className='overflow-auto h-full'>
      {streams.map((stream: Stream) => {

        const expanded = stream.stream.properties.name === streamName;
        const baseClass = expanded ? classes.rootExpanded : classes.root;

        return (
          <Accordion
            className= {baseClass}
            elevation={0}
            key={stream.stream.elementId}
            expanded={expanded}
          >
            <Link to={expanded ? "/streams" : stream.stream.properties.name}>
              <AccordionSummary className='bg-white'>
                <Typography>{stream.stream.properties.name}</Typography>
              </AccordionSummary>
            </Link>

            <AccordionDetails className="bg-transparent">
              <StreamConfig userLists={lists} streamName={streamName}/>

              <h1> {stream.seedUsers?.length} Seed Users</h1>
              <div className='flex flex-col space-y-2'>
                {stream.seedUsers && stream.seedUsers.map((user: userNode) => (
                  <CompactProfile user={user} key={user.elementId} streamName={streamName} />
                  ))}
              </div>

              <h1> {stream.recommendedUsers ? stream.recommendedUsers.length : 0} Recommended Accounts </h1>
              {stream.recommendedUsers && stream.recommendedUsers.map((user: userNode) => (
                <CompactProfile user={user} key={user.elementId} streamName={streamName} />
                ))}


            </AccordionDetails>
          </Accordion>
        )
      })}
    </div>
  )
}

export default StreamAccordion
