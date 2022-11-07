import { useState, useRef, useEffect } from 'react';
import { Link, useParams, useTransition } from "@remix-run/react";
import cn from 'classnames';

import { MdKeyboardArrowRight } from "react-icons/md";

import CompactProfile from './CompactProfile';
import StreamConfig from './StreamConfig';
import type { streamNode } from '~/models/streams.server';
import type { userNode } from '~/models/user.server';

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
  const transition = useTransition()
  // TODO: get the path so it doesn't show every single stream as loading... 
  if (transition.state == "loading") {
    return <div>Loading....</div>
  }

  return (
    <Link to={isOpen ? "/streams" : `${streamName}`}>
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

const AccordionDetails = ({ height, stream }) => {
  return (
    <div
      className="relative min-w-full"
      style={{ minHeight: height - 50 }}
    >

      <StreamConfig streamName={stream.stream.properties.name} />

      <div className='mx-2 my-2'>
        <div className='flex flex-col space-y-1 items-center m-4'>
          <h1 className='font-medium text-gray-600'>  Seed Users </h1>
          <p className='text-sm text-center px-4 text-gray-400'>Seed Accounts grow the Recommended Accounts below</p>
        </div>

        <div className='flex flex-col space-y-2'>
          {stream.seedUsers && stream.seedUsers.map((user: userNode) => (
            <CompactProfile user={user} key={user.elementId} streamName={stream.stream.properties.name} isSeed />
          ))}
        </div>

        <div className='flex flex-col space-y-1 items-center mb-4 mt-12'>
          <h1 className='font-medium text-gray-600'>  Recommended Accounts </h1>
          <p className='text-sm text-center px-4 text-gray-400'>Account Recommendation is using the concept of a ‘meta-follower’ between Seed Accounts to make these recommendations</p>
        </div>

        <div className='flex flex-col space-y-2'>
          {stream.recommendedUsers && stream.recommendedUsers.map((user: userNode) => (
            <CompactProfile user={user} key={user.elementId} streamName={stream.stream.properties.name} isSeed={false} />
          ))}
        </div>
      </div>

    </div>
  )
}

const Accordion = ({ height, stream, openStream, setOpenStream, lists }) => {

  const isOpen = openStream === stream.stream.properties.name;

  return (
    <div className=''>
      <AccordionSummary streamName={stream.stream.properties.name} isOpen={isOpen} setOpenStream={setOpenStream} />

      {isOpen && (
        <AccordionDetails height={height} stream={stream} />
      )}
    </div>

  )
}


function StreamAccordion({ streams, lists }: { streams: Stream[] }) {
  // TODO: onOpen redirect to $streamName
  // TODO: perf should be much better when folding/unfolding streams
  const { streamName } = useParams();
  const openStreamName = streamName;

  // const [openStream, setOpenStream] = useState("");

  const accordionRef = useRef() as React.MutableRefObject<HTMLInputElement>;
  const [height, setHeight] = useState(Number);

  // set height according to parent clientHeight
  useEffect(() => {
    console.log(`Accordion ref: ${accordionRef.current.clientHeight}`);
    setHeight(accordionRef.current.clientHeight);
  }, [openStreamName])


  return (
    <div className="grow relative w-full" ref={accordionRef}>
      <div
        className={
          cn("accordion-container w-full bg-radial bg-gray-100 border border-gray-200 p-1 rounded z-0",
            { "overflow-y-scroll overflow-x-hidden": openStreamName },

          )}
        style={openStreamName ? { height: height } : {}}
      >
        {streams.map((stream, index) => (
          <Accordion
            key={index}
            height={height}
            stream={stream}
            openStream={openStreamName}
            // setOpenStream={setOpenStream}
            lists={lists}
          />
        ))}
      </div>
    </div>
  )
}


export default StreamAccordion

