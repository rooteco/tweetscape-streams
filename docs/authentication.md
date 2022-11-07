# Tweetscape Auth

- **users can only sign into Tweetscape if they have a twitter account** to create tweetscape specific accounts at this stage)
- we are using twitter api v2. Of which, the available endpoints are laid out here: [https://developer.twitter.com/en/docs/api-reference-index](https://developer.twitter.com/en/docs/api-reference-index)
- Auth docs
    - twitter docs: 
        - [https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token](https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token)
        - [https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token](https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token)

### Code
We follow the flow documented by the [node-twitter-api-v2](https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/auth.md#oauth2-user-wide-authentication-flow) library. 

There are two main routes in the code used for auth:

1. `app/routes/oauth.ts`

The loader function uses the node-api-twitter-api-v2 helper func `client.generateOAuth2AuthLink` to generate a twitter login url that users are redirected to. After confirming they are redirected back to the `app/routes/streams.tsx` route. 

2. `app/routes/streams.tsx` 

They are then redirected back to tweetscape with a stateId and code provided by twitter that we use in the app loader. 

In the loader function, there is this line: `else if (stateId && code) {`, in that code block, we used the data from the twitter redirect to get an access token and refresh token, then store that in our postgres db. 

