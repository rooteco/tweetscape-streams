import { TimeAgo } from '~/components/timeago';
import twitter from 'twitter-text';

function html(text: string): string {
    return twitter.autoLink(text, {
        usernameIncludeSymbol: true,
        linkAttributeBlock(entity, attrs) {
            attrs.target = '_blank';
            attrs.rel = 'noopener noreferrer';
            attrs.class = 'hover:underline dark:text-sky-400 text-sky-500';
        },
    });
}
function Tweet({ tweet }) {
    const quoteTweet = {
        tweet: null,
        author: null,
        refTweets: [],
        refTweetRels: []
    }
    const repliedToTweet = {
        tweet: null,
        author: null,
        refTweets: [],
        refTweetRels: []
    }

    let retweet = false
    let tweetAuthor = tweet.author

    tweet.refTweetRels.forEach((rel, index) => {
        if (rel.properties.type == 'quoted') {
            quoteTweet.tweet = tweet.refTweets[index]
            quoteTweet.author = tweet.refTweetAuthors[index]
        }
        if (rel.properties.type == 'retweeted') {
            retweet = true
            const refTweet = tweet.refTweets[index]
            const refTweetAuthorId = refTweet.properties.author_id
            tweetAuthor = tweet.refTweetAuthors.filter((a) => (a.properties.id == refTweetAuthorId))[0]
        }
        if (rel.properties.type == 'replied_to') {
            repliedToTweet.tweet = tweet.refTweets[index]
            repliedToTweet.author = tweet.refTweetAuthors[index]
        }
    })
    const tweetText = html(tweet.tweet.properties.text)
    return (
        <div className="border border-gray-400 py-4 px-3 rounded-lg bg-white my-2">
            {
                repliedToTweet.tweet ?
                    <div>
                        <Tweet tweet={repliedToTweet} />
                        <p>reply to ^^</p>
                    </div>
                    : null
            }
            {
                retweet ?
                    <a
                        href={`https://twitter.com/${tweet.author.properties.username}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-gray-400 mr-1 font-medium hover:underline'
                    >{tweet.author.properties.username} retweeted</a> : null
            }
            <div className='mx-2 flex'>
                <img
                    className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                    alt=''
                    src={tweetAuthor.properties.profile_image_url}
                />
                <article className='ml-2.5 flex-1'>
                    <header>
                        <h3>
                            <a
                                href={`https://twitter.com/${tweetAuthor.properties.username}`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='mr-1 font-medium hover:underline'
                            >
                                {tweetAuthor.properties.name}
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
                                href={`/tweets/${tweet.tweet.properties.id}`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='text-sm text-gray-500 hover:underline'
                            >
                                analyze
                            </a>
                        </h3>
                    </header>
                    <p className="text-md" dangerouslySetInnerHTML={{ __html: tweetText }} />
                    <div className="flex flex-wrap">
                        {
                            tweet.media ?
                                tweet.media.filter((media) => (media.properties.type == "photo")).map(
                                    (media) => {
                                        return (
                                            <img
                                                className="border border-gray-800"
                                                src={media.properties.url}
                                            />
                                        )
                                    }
                                ) : null
                        }
                    </div>
                </article>
            </div>
            {
                quoteTweet.tweet ?
                    <div className="pl-6">
                        <Tweet tweet={quoteTweet} />
                    </div>

                    : null
            }
        </div>
    )
}

export default Tweet
