import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';

import { Integer } from 'neo4j-driver';
import { NavLink, Outlet, useParams } from "@remix-run/react";
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


function StreamAccordion({ streams, lists }: { streams: Stream[] }) {

  const [outlet, toggleOutlet] = useState(false)
  const { streamName } = useParams();

  useEffect(() => {
    console.log(streamName)
  }, [streamName])

  return (
    <div>
      {streams.map((stream: Stream) => (
        <Accordion
          key={stream.stream.elementId}
          onChange={(e, expanded) => {
            if (expanded) {
              toggleOutlet(true)
            }
          }}
          expanded={stream.stream.properties.name === streamName}
        >
          <NavLink to={stream.stream.properties.name}>
            <AccordionSummary>
              <Typography>{stream.stream.properties.name}</Typography>
            </AccordionSummary>
          </NavLink>

          <AccordionDetails className="overflow-scroll" sx={{ height: '300px' }}>

            <StreamConfig userLists={lists} streamName = {streamName}/>

            <h1> {stream.seedUsers?.length} Seed Users</h1>
            {stream.seedUsers && stream.seedUsers.map((user: userNode) => (
              <CompactProfile user = {user} key = {user.elementId}/>
            ))}

            <h1> {stream.recommendedUsers? stream.recommendedUsers.length : 0} Recommended Accounts </h1>
            {stream.recommendedUsers && stream.recommendedUsers.map((user: userNode) => (
              <CompactProfile user = {user} key = {user.elementId}/>
            ))}

          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  )
}

export default StreamAccordion

