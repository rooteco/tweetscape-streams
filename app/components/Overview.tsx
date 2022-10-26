import type { LoaderArgs } from "@remix-run/node"
import { useLoaderData, useMatches, useSearchParams } from "@remix-run/react";
import { Link, useParams } from "@remix-run/react";
import { StreamTweetsEntityCounts } from '~/models/streams.server'
import Chip from '~/components/Chip';

import ContextAnnotationChip from '~/components/ContextAnnotationChip';
import invariant from "tiny-invariant";

// export { action } from '~/routes/streams/$streamName';

// export async function loader({ request, params }: LoaderArgs) {
//     invariant(params.streamName, "streamName not found");
//     console.time("StreamTweetsEntityCounts in $streamName/overview")
//     const entityCountData = await StreamTweetsEntityCounts(params.streamName)
//     console.timeEnd("StreamTweetsEntityCounts in $streamName/overview")
//     return entityCountData
// };

export default function Overview({ entityDistribution, tweets }) {
    // Responsible for rendering the overview page for a stream
    const { streamName } = useParams();
    const [searchParams] = useSearchParams();
    const tweetAuthorCount = new Map()
    tweets.map((row) => {
        const author = row.author.properties.username
        const curCount = tweetAuthorCount.get(author)
        if (curCount) {
            tweetAuthorCount.set(author, curCount + 1)
        } else {
            tweetAuthorCount.set(author, 1)
        }
    })
    let tweetAuthorCountRows = []; // create array to map author distribution values in the component below
    tweetAuthorCount.forEach((value, key) => {
        tweetAuthorCountRows.push(`${key}=${value}`)
    })
    const receivedReferenceCount = new Map()
    tweets.map((row) => {
        const tweetAuthorId = row.author.properties.id
        for (let refA of row.refTweetAuthors) {
            if (refA.properties.id != tweetAuthorId) {
                const curCount = receivedReferenceCount.get(refA.properties.username)
                if (curCount) {
                    receivedReferenceCount.set(refA.properties.username, curCount + 1)
                } else {
                    receivedReferenceCount.set(refA.properties.username, 1)
                }
            }
        }
    })

    return (
        <>
            <div className='w-full px-4'>
                <div className="w-full mx-auto overflow-scroll p-2 sm:max-h-[40vh] xl:max-h-[30vh]">

                    <div className="flex gap-2">
                        <p>Tweets Today <b>Do i want this?</b></p>
                        <p>Tweets in the Last Week <b>get this a different way</b></p>

                    </div>

                    <p className="text-md font-medium my-4">Tweet Distribution</p>
                    <div className="flex flex-wrap gap-1 px-1">
                        {
                            tweetAuthorCountRows.map((row) => (
                                <div>
                                    <div className='bg-green-200 hover:bg-green-500 rounded-full flex items-center p-2'>
                                        {row}
                                    </div>
                                    {/* <Chip
                                        key={row.name}
                                        label={row.split('=')[0]}
                                        message={row}
                                        size="small"
                                        sx={{ backgroundColor: '#FFFFFF', border: '1px solid #DDDAF8', color: '#374151', fontSize: '0.75rem' }}
                                        avatar={<div style={{ backgroundColor: "#E7E5FC", borderRadius: "50%", fontSize: '0.5rem' }} className="w-6 h-6 flex items-align text-center justify-center text-xs">{row.split('=')[1]}</div>}
                                    /> */}
                                </div>
                            ))
                        }
                    </div>
                    <p className="text-md font-medium my-4">Selected Twitter Topics (used as filter)</p>
                    <div className="flex flex-wrap max-w-sm">
                        {entityDistribution.filter((entity) => (searchParams.getAll("topicFilter").indexOf(entity.item.properties.name) > -1))
                            .map((entity, index) => (
                                <ContextAnnotationChip
                                    keyValue={entity.item.properties.name}
                                    value={entity.count}
                                    caEntities={searchParams.getAll("topicFilter")}
                                    hideTopics={[]} key={`entityAnnotations-${entity.item.properties.name}-${index}`}
                                    streamName={streamName}
                                />
                            ))}
                    </div>
                    <p className="text-md font-medium my-4">Twitter Topics (add to filters above)</p>
                    <div className="flex flex-wrap max-w-sm">
                        {entityDistribution.filter((entity) => (searchParams.getAll("topicFilter").indexOf(entity.item.properties.name) == -1))
                            .map((entity, index) => (
                                <ContextAnnotationChip
                                    keyValue={entity.item.properties.name}
                                    value={entity.count}
                                    caEntities={searchParams.getAll("topicFilter")}
                                    hideTopics={[]} key={`entityAnnotations-${entity.item.properties.name}-${index}`}
                                    streamName={streamName}
                                />
                            ))}
                    </div>
                </div>
            </div>

        </>

    );
}