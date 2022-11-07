# Backend behavior

This document navigates you through the source code to help you understand the backend behavior.

**CAUTION**: The behavior described here is subject to change.
- Nov 9, 2022: summarized the source code at [`bf2d67840814e9da099af88798713667890a6c0a`](https://github.com/rooteco/tweetscape-streams/tree/bf2d67840814e9da099af88798713667890a6c0a)

## /routes/index.tsx

### loader

Just redirects to [`/streams`](#routesstreamstsx).

### action

No action.

## /routes/streams.tsx

### loader

#### not logged in (uid == null)

Prompts the user to login with the Tiwtter account.
Please refer to [`/streams/index.tsx`](#routesstreamsindextsx).

This is also the redirect destination for the OAuth flow on Twitter.
When a Twitter account is authenticated, updates the user info on the PostgreSQL database.
It also pushes user's Twitter token to the PostgreSQL database.

#### already logged in (uid != null)

Requests Twitter for the user info.

- Obtains streams created by the user ([`getUserStreams`](#getuserstreams)).
- Obtains streams created by other users ([`getAllStreams`](#getallstreams)).

### action

No action.

## /routes/streams/index.tsx

### loader

No loader.

#### not logged in (user == null)

Shows a login button.

#### already logged in (user != null)

Shows a new stream button.

### action

- Checks if the stream exists ([`getStreamByName`](#getstreambyname)).
- Obtains the user info from Twitter.
- Creates the user if necessary ([`createUserNeo4j`](#createuserneo4j)).
- Creates a Twitter list.
- Creates a new stream ([`createStream`](#createstream)).
- Redirects to [`/streams/$streamName`](#routesstreamsstreamname).

## /routes/streams/$streamName

### loader

- Obtains the stream ([`getStreamByName`](#getstreambyname)).
- Obtains the user info from Twitter.
- Obtains the Twitter list corresponding to the stream.
    - If the stream is legacy, creates a Twitter list if the stream, recreates a new stream ([`createStream`](#createstream)), and re-adds seed users ([`addSeedUserToStream`](#addseedusertostream)).
    - If a Twitter list no longer exists (deleted), recreates it and a new stream ([`createStrea`](#createstream)).
      Re-adding seed users ([`addSeedUserToStream`](#addseedusertostream)) is suspended for now.
- Indexes older tweets with [`indexMoreTweets`](#indexmoretweets) if `indexMoreTweets` query parameter is given
- Indexes newer tweets with [`updateStreamTweets`](#updatestreamtweets)
- Obtains the latest indexed 25 tweets in the stream ([`getStreamTweetsNeo4j`](#getstreamtweetsneo4j))

### action

- Obtains the stream ([`getStreamByName`](#getstreambyname)).
- Returns the next page of tweets if `page` query parameter is given.
    - Calls [`getStreamTweetsNeo4j`](#getstreamtweetsneo4j) with `skip` to read tweets on a specific page.
    - No navigation happens.
- Deletes the stream if `intent` query parameter is "delete".
    - Deletes the stream ([`deleteStreamByName`](#deletestreambyname)).
    - Deletes the Twitter list.
    - Redirects to [`/streams`](#routesstreamstsx).
- Adds a seed user to the stream if `intent` query parameter is "addSeedUser".
    - Fails if a given seed user is already in the stream.
    - Checks if there is the user node of the seed user ([`getUserNeo4j`](#getuserneo4j)).
    - Creates a new `User` node of the seed user if it does not exist.
        - Obtains the user info from Twitter.
        - Creates a new `User` node of the seed user ([`createUserNeo4j`](#createuserneo4j)).
    - Adds the seed user to the stream ([`addSeedUserToStream`](#addseedusertostream)).
    - Adds the seed user to the Twitter list.
    - Adds the users followed by the seed user ([`indexUser`](#indexuser)).
    - Redirects to [`/streams/$streamName`](#routesstreamsstreamname) but I do not think any navigation would happen on a browser.
- Deletes a seed user from the stream if `indent` query parameter is "removeSeedUser".
    - Obtains the `User` nod of the seed user ([`getUserNeo4j`](#getuserneo4j)).
    - Removes the seed user from the Twitter list.
    - Removes the seed user from the stream ([`removeSeedUserFromStream`](#removeseeduserfromstream)).
    - Redirects to [`/streams/$streamName`](#routesstreamsstreamname) but I do not think any navigation would happen on a browser.

Actions to update a stream happens in the component [`CompactProfile`](#componentscompactprofiletsx).
The action to delete a stream (`indent="delete"`) happens in the component [`ExportAndDelete`](#componentsexportanddelete).

## /models/streams.server.ts

### getUserStreams

- Gets user's `Stream` nodes.
- Collects recommended accounts for user's streams.
- For now, a recommended account is a commonly followed account among the seed users of a stream.
- Lists at most 5 recommended users.

**No Twitter access**.

### getAllStreams

- Gets `Stream` nodes created by other users.
- Has the same logic as [`getUserStreams`](#getuserstreams) except for the condition to collect streams.

### getStreamByName

- Gets the `Stream` node that has a given name.

### createStream

- Adds a new `Stream` node in the neo4j database.

### deleteStreamByName

- Deletes a given `Stream` node from the neo4j database.

### addSeedUserToStream

- Upserts a "CONAINS" relationship from a given `Stream` node to a given `User` node.

### removeSeedUserFromStream

- Deletes the "CONTAINS" relationship from a given `Stream` node to a given `User` node.

### indexMoreTweets

- Calls [`indexUserOlderTweets`](#indexuseroldertweets) for each seed user

### updateStreamTweets

- Calls [`indexUserNewTweets`](#indexusernewtweets) for each seed user

### addUsers

- Upserts given users.
- Returns upserted `User` nodes. (I do not think results are used)

### addUsersFollowedBy

- Deletes all the "FOLLOWS" relationships from a given follower user.
- Adds "FOLLOWS" relationships from the follower user to follwed users.
    - Upserts `User` nodes of followed users.
- Returns upserted `User` nodes. (I do not think results are used)

### addTweetMedia

- Adds or updates media.
- Returns added or updated `Media` nodes. (I do not think results are used)

### addTweetsFrom

- Adds or updates tweets.
- Adds `User` nodes of authors if necessary.
- Adds "POSTED" relationships from authors to tweets.
- Adds `User` nodes of mentioned users if necessary.
- Adds "MENTIONED" relationships from tweets to mentioned users.
- Adds `URL` nodes if necessary.
- Adds "LINKED" relationships from tweets to URLs.
- Adds `Annotation` nodes if necessary.
- Adds "ANNOTATED" relationships from tweets to annotations.
- Adds `Domain` nodes if necessary.
- Adds "CATEGORY" relationships from tweets to domains.
- Adds `Entity` nodes if necessary.
- Adds "INCLUDED" relationships from tweets to entities.
- Adds `Hashtag` nodes if necessary.
- Adds "TAG" relationships from tweets to hashtags.
- Adds `Cashtag` nodes if necessary.
- Adds "TAG" relationships from tweets to cashtags.
- Adds `Media` nodes if there are attachments.
- Adds "ATTACHED" relationships from tweets to attached media.
- Adds referenced `Tweet` nodes if necessary.
- Adds "REFERENCED" relationships from tweets to referenced tweets.
- Returns added or updated `Tweet` nodes. (I do not think results are used)

### getStreamTweetsNeo4j

- Obtains the latest N indexed tweets from the neo4j database.
    - Leaves only tweets that have one or more entities listed in `tags` if `tags` is specified.
- Optionally retrieves the following,
    - referenced tweets
    - entities
    - attached media
    - annotations
- Returns obtained tweets

### bulkWrites

- Splits a given array into chunks of 100 items.
- Processes each chunk with a given write function.

### bulkWritesMulti

This function is a variation of [`bulkWrites`](#bulkwrites) that can pass an additional argument to the write function.

### getSavedFollows

- Obtains `User` nodes whom a given user follows.

## /models/user.server.ts

### getUserNeo4j

- Obtains the `User` node of a given username.

### createUserNeo4j

- Upserts the `User` node of a given user in the neo4j database.

### indexUserOlderTweets

- Pulls the latest 100 tweets before the oldest tweet a given user has indexed ([`pullTweets`](#pulltweets)).
- Pushes the pulled tweets into the neo4j database ([`bulkWrite`](#bulkwrite)).
    - Adds tweet users with [`addUsers`](#addusers). According to the [Twitter API doc](https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets#tab0), users may be
        - The Tweet author's user object
        - The user object of the Tweet's author that the original Tweet is responding to
        - Any mentioned users' object
        - Any referenced Tweets' author's user object
    - Adds tweet media with [`addTweetMedia`](#addtweetmedia)
    - Adds referenced tweets with [`addTweetsFrom`](#addtweetsfrom)
    - Adds user's tweets with [`addTweetsFrom`](#addtweetsfrom)
    - Updates indexed tweet range of the user ([`updateUserIndexedTweetIds`](#updateuserindexedtweetids))

See also [`TwitterV2IncludesHelper`](https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/helpers.md#helpers-for-includes-of-v2-api-responses).

### indexUserNewTweets

- Pulls the oldest 100 tweets after the newest tweet a given user has indexed ([`pullTweets`](#pulltweets)).
    - Pulls the latest 100 tweets of the user if the user has not indexed yet.
- Does the same operations on the pulled tweets as [`indexUserOlderTweets`](#indexuseroldertweets).

### pullTweets

Pulls tweets staisfying given conditions from Twitter.

### indexUser

- If the `User` node has no `lastFollowsIndex`,
    - Checks if follows of a given user has changed ([`getSavedFollows`](#getsavedfollows)).
    - Obtains user's follows from Twitter if the follows have changed.
        - TBC: does `following.fetchNext()` accumulates results in `following.data.data`?
        - Adds "FOLLOWS" relationships from the user to follows ([`bulkWritesMulti`](#bulkwritesmulti) &times; [`addUsersFollowedBy`](#addusersfollowedby))
    - Updates `lastFollowsIndex` ([`updateUserLastfollowsIndex`](#updateuserlastfollowsindex))
- Pulls user's latest tweets ([`indexUserNewTweets`](#indexusernewtweets) without a tweet ID range).

TBC: is it OK if user's follows are never updated once `lastFollowsIndex` is assigned?

### updateUserIndexedTweetIds

Updates the latest and earliest tweet IDs of a given user.
This information is used to pull further tweets of the user.

### updateUserLastfollowsIndex

- Upserts a `User` node with a given `lastFollowsIndex` (a date string).

## /components/CompactProfile.tsx

TBD

## /components/ExportAndDelete.tsx

TBD