import { useState, useRef, useEffect } from 'react';
import { Integer } from 'neo4j-driver';
import { Link, useParams } from "@remix-run/react";
import cn from 'classnames';

import Chip from '@mui/material/Chip';


import { MdKeyboardArrowRight } from "react-icons/md";

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


const AccordionSummary = ({ streamName, isOpen, setOpenStream }) => {

  const handleClick = () => {
    isOpen ? setOpenStream(null) : setOpenStream(streamName);
  };

  return (
    <Link to={isOpen ? "/streams" : `${streamName}/overview`}>
      <div
        className={
          cn(
            "bg-white flex gap-1 rounded align-middle items-center py-1 pl-2  font-medium text-sm text-gray-400 cursor-pointer",
            { "sticky top-0 z-10": isOpen },
           
            
          )
        }
        onClick={handleClick}
        style={isOpen ? { color: '#1D1D1D' } : { color: '#949DA7' }}
      >
        <MdKeyboardArrowRight
          size={22}
          className={cn(
            "transform transition-transform duration-300 ease-in-out",
            { "rotate-90": isOpen },
          )}
        />
        {streamName}
      </div >
    </Link>
  )

}

const AccordionDetails = ({ height, streamName }) => {
  return (
    <div
      className="relative min-w-full"
      style={{ minHeight: height - 50 }}
    >

      <StreamConfig />

      <div className='mx-2 my-2'>
        <div className='flex flex-col space-y-1 items-center m-4'>
          <h1 className='font-medium text-gray-600'>  Seed Users </h1>
          <p className='text-sm text-center px-4 text-gray-400'>Seed Accounts grow the Recommended Accounts below</p>
        </div>

        <div className='flex flex-col space-y-2'>

        </div>

        <div className='flex flex-col space-y-1 items-center mb-4 mt-12'>
          <h1 className='font-medium text-gray-600'>  Recommended Accounts </h1>
          <p className='text-sm text-center px-4 text-gray-400'>Account Recommendation is using the concept of a ‘meta-follower’ between Seed Accounts to make these recommendations</p>
        </div>

        <div className='flex flex-col space-y-2'>

        </div>
      </div>

    </div>
  )
}

const Accordion = ({ height, streamName, openStream, setOpenStream }) => {

  const isOpen = openStream === streamName;

  return (
    <div className=''>
      <AccordionSummary streamName={streamName} isOpen={isOpen} setOpenStream={setOpenStream} />

      {isOpen && (
        <AccordionDetails height={height} streamName={streamName} />
      )}
    </div>

  )
}


function StreamAccordion({ streams, lists }: { streams: Stream[] }) {
  // TODO: onOpen redirect to $streamName
  // TODO: perf should be much better when folding/unfolding streams

  const { streamName } = useParams();
  const [openStream, setOpenStream] = useState("");

  const accordionRef = useRef() as React.MutableRefObject<HTMLInputElement>;
  const [height, setHeight] = useState(Number);

  // set height according to parent clientHeight
  useEffect(() => {
    console.log(`Accordion ref: ${accordionRef.current.clientHeight}`);
    setHeight(accordionRef.current.clientHeight);

  }, [openStream])


  return (
    <div className="grow relative w-full" ref={accordionRef}>
      <div
        className={
          cn("accordion-container w-full bg-radial bg-gray-100 border border-gray-200 p-1 rounded z-0",
            { "overflow-y-scroll overflow-x-hidden": openStream },

          )}
        style={openStream ? { height: height } : {}}
      >
        {streams.map((stream, index) => (
          <Accordion
            key={index}
            height={height}
            streamName={stream.stream.properties.name}
            openStream={openStream}
            setOpenStream={setOpenStream}
          />
        ))}
      </div>
    </div>
  )
}


function OldAccordion() {
  return (
    <div>
      {streams.map((stream: Stream) => {

        const expanded = stream.stream.properties.name === streamName;

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

