import { TimeAgo } from '~/components/timeago';
import ContextAnnotationChip from '~/components/ContextAnnotationChip';
import twitter from 'twitter-text';
import cn from 'classnames';
import ReplyIcon from '~/icons/reply';
import RetweetIcon from '~/icons/retweet';
import RetweetedIcon from '~/icons/retweeted';
import ShareIcon from '~/icons/share';
import LikeIcon from '~/icons/like';
import LikedIcon from '~/icons/liked';
import VerifiedIcon from '~/icons/verified';
import { useFetcher, useFetchers, useMatches, Link } from '@remix-run/react';


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

type ActionProps = {
    active?: boolean;
    count?: number;
    color: string;
    icon: ReactNode;
    href: string;
    action?: string;
    activeIcon?: ReactNode;
    id?: string;
};

function num(n: number): string {
    if (n > 1000000) return `${(n / 1000000).toFixed(1).replace('.0', '')}M`;
    if (n > 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}K`;
    return n.toString();
}

function Action({
    active,
    count,
    color,
    icon,
    href,
    action,
    activeIcon,
    id,
}: ActionProps) {
    const fetchers = useFetchers()
    const path = `/actions/${action}/${id}`;
    const fetching = fetchers.find((f) => f.submission?.action === path);
    const isActive = fetching ? fetching.submission?.method === 'POST' : !!active;
    const fetcher = useFetcher()
    const iconWrapperComponent = (
        <div
            className={cn('p-1.5 mr-0.5 rounded-full transition duration-[0.2s]', {
                'group-hover:bg-red-50 group-active:bg-red-50': color === 'red',
                'group-hover:bg-blue-50 group-active:bg-blue-50': color === 'blue',
                'group-hover:bg-green-50 group-active:bg-green-50': color === 'green',
            })}
        >
            {isActive ? activeIcon : icon}
        </div>
    );
    const className = cn(
        'disabled:cursor-wait inline-flex justify-start items-center transition duration-[0.2s] group',
        {
            'hover:text-red-550 active:text-red-550': color === 'red',
            'hover:text-blue-550 active:text-blue-550': color === 'blue',
            'hover:text-green-550 active:text-green-550': color === 'green',
            'text-red-550': color === 'red' && isActive,
            'text-blue-550': color === 'blue' && isActive,
            'text-green-550': color === 'green' && isActive,
        }
    );
    const root = useMatches()[0].data
    const n = count !== undefined && count + (isActive ? 1 : 0);
    if (root?.user && action && id)
        return (
            <fetcher.Form
                className='grow shrink basis-0 mr-5 h-8'
                method={isActive ? 'delete' : 'post'}
                action={path}
            >
                <button type='submit' className={cn('w-full', className)}>
                    {iconWrapperComponent}
                    {!!n && num(n)}
                </button>
                <input
                    type='hidden'
                    name='action'
                    value={isActive ? 'delete' : 'post'}
                />
            </fetcher.Form>
        );
    return (
        <a
            className={cn('grow shrink basis-0 mr-5 h-8', className)}
            href={href}
            rel='noopener noreferrer'
            target='_blank'
        >
            {iconWrapperComponent}
            {!!n && num(n)}
        </a>
    );
}

function Tweet({ tweet, searchParams }) {
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

    const showTopics = (searchParams && tweet.entities)

    try {
        return (
            <div className="border border-gray-400 py-4 px-3 rounded-lg bg-white my-2">
                <div className="flex flex-wrap mb-4">
                    {
                        showTopics &&
                        tweet.entities.map((entity: Record, index: number) => (
                            <div>
                                <ContextAnnotationChip
                                    keyValue={entity.properties.name}
                                    value={null} caEntities={searchParams.getAll("topicFilter")}
                                    hideTopics={[]}
                                    key={`entityAnnotationsUnderTweet-${entity.properties.name}-${index}`}
                                />
                            </div>
                        ))
                    }
                </div>
                {
                    repliedToTweet.tweet ?
                        <div>
                            <Tweet tweet={repliedToTweet} searchParams={searchParams} />
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

                    <Link
                        to={`/streams/users/${tweetAuthor.properties.username}`}
                        target="_blank"
                    >
                        <img
                            className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                            alt=''
                            src={tweetAuthor.properties.profile_image_url}
                        />
                    </Link>
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
                        <div className='-m-1.5 flex items-stretch min-w-0 justify-between text-gray-500'>
                            <Action
                                color='blue'
                                icon={<ReplyIcon />}
                                href={`https://twitter.com/intent/tweet?in_reply_to=${tweet.tweet.properties.id}`}
                                count={tweet.tweet.properties["public_metrics.reply_count"]}
                            />
                            <Action
                                color='green'
                                icon={<RetweetIcon />}
                                href={`https://twitter.com/intent/retweet?tweet_id=${tweet.tweet.properties.id}`}
                                action='retweet'
                                id={tweet.tweet.properties.id}
                                count={tweet.tweet.properties["public_metrics.retweet_count"] + tweet.tweet.properties["public_metrics.quote_count"]}
                                active={false}
                                activeIcon={<RetweetedIcon />}
                            />
                            <Action
                                color='red'
                                icon={<LikeIcon />}
                                href={`https://twitter.com/intent/like?tweet_id=${tweet.tweet.properties.id}`}
                                action='like'
                                id={tweet.tweet.properties.id}
                                count={tweet.tweet.properties["public_metrics.like_count"]}
                                active={tweet?.liked}
                                activeIcon={<LikedIcon />}
                            />
                            <Action
                                color='blue'
                                icon={<ShareIcon />}
                                href={`https://twitter.com/${tweet.author.properties.username}/status/${tweet.tweet.properties.id}`}
                            />
                        </div>
                    </article>
                </div>
                {
                    displayQuoteTweet(quoteTweet, searchParams)
                }
            </div>
        )
    } catch (e) {
        console.log("did it fuck up, i betT")
        console.log(e)
        return <div>FUCK UP, it's probably because `refTweet.properties.author_id` is null</div>
    }
}

function displayQuoteTweet(quoteTweet, searchParams) {
    if (quoteTweet.tweet && quoteTweet.author) {
        return (
            <div className="pl-6">
                <Tweet tweet={quoteTweet} searchParams={searchParams} />
            </div>
        )
    } else {
        return null
    }
}

export default Tweet
