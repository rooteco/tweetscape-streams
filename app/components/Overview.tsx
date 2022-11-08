import type { tweetAndRelatedEntities } from "~/models/streams.server";

export default function Overview({ tweets }: { tweets: Array<tweetAndRelatedEntities> }) {
    // Responsible for rendering the overview page for a stream
    const tweetAuthorCount = new Map()
    tweets.forEach((row) => {
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
    tweets.forEach((row) => {
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
                    <p className="text-md font-medium my-4">Tweet Distribution (of currently loaded tweets)</p>
                    <div className="flex flex-wrap gap-1 px-1">
                        {
                            tweetAuthorCountRows.map((row, index) => (
                                <div key={index}>
                                    <div className='bg-green-200 hover:bg-green-500 rounded-full flex items-center p-2'>
                                        {row}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
        </>

    );
}