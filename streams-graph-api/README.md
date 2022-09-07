

## Data Model


### Tweet

### User

More data to parse:
* entities connected to user
    * urls
```json
{'username': 'nicktorba',
 'id': '803693608419422209',
 'created_at': '2016-11-29T20:14:22.000Z',
 'name': 'Nick Torba',
 'pinned_tweet_id': '1499774239922130946',
 'verified': False,
 'profile_image_url': 'https://pbs.twimg.com/profile_images/1375548941538750465/kjPxgiWX_normal.jpg',
 'public_metrics': {'followers_count': 274,
  'following_count': 540,
  'tweet_count': 4099,
  'listed_count': 8},
 'description': 'everywhere I go, there I am | building @TweetscapeHQ | hanging @roote_ | writing https://t.co/PBxsLBeEAO | reading https://t.co/n6w8cS8mcD',
 'protected': False,
 'location': 'Philadelphia, PA',
 'entities': {'url': {'urls': [{'start': 0,
     'end': 23,
     'url': 'https://t.co/C8yIPStHx3',
     'expanded_url': 'http://nicktorba.com',
     'display_url': 'nicktorba.com'}]},
  'description': {'urls': [{'start': 81,
     'end': 104,
     'url': 'https://t.co/PBxsLBeEAO',
     'expanded_url': 'http://cultivatingtaste.substack.com',
     'display_url': 'cultivatingtaste.substack.com'},
    {'start': 115,
     'end': 138,
     'url': 'https://t.co/n6w8cS8mcD',
     'expanded_url': 'http://getmatter.app/torba',
     'display_url': 'getmatter.app/torba'}],
   'mentions': [{'start': 39, 'end': 52, 'username': 'TweetscapeHQ'},
    {'start': 63, 'end': 70, 'username': 'roote_'}]}},
 'url': 'https://t.co/C8yIPStHx3'}
 ```