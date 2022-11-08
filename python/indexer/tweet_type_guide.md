# Extract_tweet_type
This is a function we can use to annotate tweets by type, which is useful for analysis. 
This is a lit of exmaples, also used for testing that function in the `tests/` dir. 

## self-reply, mention

self-replies are when the `author.id` matches the `in_reply_to_user_id`, although i had issues with this before... which led to the bug in the current code... i'll keep an eye out for this

* in a thread: 
https://twitter.com/anniefryman/status/1530958581746388992?s=20&t=5IsqOIPcU1yk63868yT8Mw

* adding in mentions manually
https://twitter.com/anniefryman/status/1547604213135339525?s=20&t=2fLWfb5H_D9U4X4bXtexQA


## self-reply

* https://twitter.com/anniefryman/status/1547764414744391680?s=20&t=MBb15Y6OKwkS_K7yA8N6TQ

## qt,self-reply

* https://twitter.com/anniefryman/status/1530715736326348801?s=20&t=2nVdM2W2IohtQvwplDrN7A

## qt,reply
* https://twitter.com/anniefryman/status/1529253803802800128?s=20&t=LC6DeSWgHGZKrytGd079vQ

## standalone 

## Reply, multiple users (should I differentiate?) 
* https://twitter.com/anniefryman/status/1547763535781847041?s=20&t=oDIJXqqvGKpXIrNqHCsCKQ

Replying to multiple users is fine... I keep that as a regular reply. I will differentiate between `self-reply` , and `self-reply,mention`, because those are sig different 

## RT
* https://twitter.com/alfred_twu/status/1536834900598341634?s=20&t=KGc7PSGOTizTk9_73EoVEg


## standalone,mention
* https://twitter.com/anniefryman/status/1547750688377081856?s=20&t=f2XpDPWfcxq9pprV0quhZg 

## qt
* https://twitter.com/anniefryman/status/1542005015958605824?s=20&t=LDtmxvf0ZZYasvI4uuw-Ig

## qt,mention
* https://twitter.com/anniefryman/status/1539294001731293184?s=20&t=vY3Q2CzXO9fJKp_6GRbeKw
