import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';

import { makeStyles } from '@material-ui/styles';
import { styled, alpha } from '@mui/material/styles';

import ArrowForwardIosSharpIcon from '@mui/icons-material/ArrowForwardIosSharp';


import type { Integer } from 'neo4j-driver';
import { Link, useParams } from "@remix-run/react";


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
  // TODO: onOpen redirect to $streamName
  // TODO: perf should be much better when folding/unfolding streams
  
  const { streamName } = useParams();
  const classes = useStyles();

  return (
    <div>
      {streams.map((stream: Stream) => {

        const expanded = stream.stream.properties.name === streamName;
        const baseClass = expanded ? classes.rootExpanded : classes.root;

        return (
          <Accordion
            elevation={0}
            key={stream.stream.elementId}
            expanded={expanded}
          >
            <Link to={expanded ? "/streams" : `${stream.stream.properties.name}/overview`}>
              <AccordionSummary
                expandIcon={<ArrowForwardIosSharpIcon sx={expanded ? { fontSize: '0.85rem', color: '#1D1D1D' } : { fontSize: '0.85rem', color: '#B9BEC4' }} />}
              >
                <p
                  className={'font-medium'}
                  style={expanded ? { color: '#1D1D1D' } : { color: '#949DA7' }}
                >
                  {stream.stream.properties.name}
                </p>
                <Chip icon={<div>🌱</div>} size="small" label={`${stream.seedUsers?.length}`} sx={{ color: "#91949a", backgroundColor: "#f1f1f1" }} />
              </AccordionSummary>
            </Link>

            <AccordionDetails>
              <StreamConfig userLists={lists} streamName={streamName} />

              <div className='mx-2 my-2'>
                <div className='flex flex-col space-y-1 items-center m-4'> 
                 <h1 className='font-medium text-gray-600'>{stream.seedUsers?.length} Seed Users </h1>
                 <p className='text-sm text-center px-4 text-gray-400'>Seed Accounts grow the Recommended Accounts below</p>
                </div>

                <div className='flex flex-col space-y-2'>
                  {stream.seedUsers && stream.seedUsers.map((user: userNode) => (
                    <CompactProfile user={user} key={user.elementId} streamName={streamName} isSeed />
                  ))}
                </div>

                <div className='flex flex-col space-y-1 items-center mb-4 mt-12'> 
                 <h1 className='font-medium text-gray-600'> {stream.recommendedUsers ? stream.recommendedUsers.length : 0} Recommended Accounts </h1>
                 <p className='text-sm text-center px-4 text-gray-400'>Account Recommendation is using the concept of a ‘meta-follower’ between Seed Accounts to make these recommendations</p>
                </div>

                <div className='flex flex-col space-y-2'>
                  {stream.recommendedUsers && stream.recommendedUsers.map((user: userNode) => (
                    <CompactProfile user={user} key={user.elementId} streamName={streamName} isSeed={false} />
                  ))}
                </div>
              </div>



            </AccordionDetails>
          </Accordion>
        )
      })}
    </div >
  )
}

export default StreamAccordion

