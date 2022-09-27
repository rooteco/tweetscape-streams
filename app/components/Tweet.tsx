import { TimeAgo } from '~/components/timeago';


function Tweet({ tweet, key }) {
    return (
        <div key ={key} className='mx-2 my-2 flex py-4 px-3 rounded-lg  bg-white border border-gray-100'>
            <img
                className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                alt=''
                src={tweet.author.properties.profile_image_url}
            />
            <article key={tweet.tweet.properties.id} className='ml-2.5 flex-1'>
                <header>
                    <h3>
                        <a
                            href={`https://twitter.com/${tweet.author.properties.username}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='mr-1 font-medium hover:underline'
                        >
                            {tweet.author.properties.name}
                        </a>
                        <a
                            href={`https://twitter.com/${tweet.author.properties.username}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-sm text-gray-500'
                        >
                            @{tweet.author.properties.username}
                        </a>
                        <span className='mx-1 text-sm text-gray-500'>·</span>
                        <a
                            href={`https://twitter.com/${tweet.author.properties.username}/status/${tweet.tweet.properties.id}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-sm text-gray-500 hover:underline'
                        >
                            <TimeAgo
                                locale='en_short'
                                datetime={new Date(tweet.tweet.properties.created_at ?? new Date())}
                            />
                        </a>
                        <span className='mx-1 text-sm text-gray-500'>·</span>
                        <a
                            href={`/streams/tweets/${tweet.tweet.properties.id}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-sm text-gray-500 hover:underline'
                        >
                            analyze
                        </a>
                    </h3>
                </header>
                <p
                    dangerouslySetInnerHTML={{ __html: tweet.html ?? tweet.tweet.properties.text }}
                />
            </article>
        </div>
    )
}

export default Tweet