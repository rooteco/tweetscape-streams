import pandas as pd
from indexer import extract_tweet_type

selected_tweet_ids_types = {
    1530958581746388992: "self-reply,mention", #different types of mentions
    1547604213135339525: "self-reply,mention", #different types of mentions
    1547763535781847041: "reply",
    1547764414744391680: "self-reply",
    1530715736326348801: "qt,self-reply",
    1529253803802800128: "qt,reply", 
    1547826678537211907: "rt",
    1547750688377081856: "standalone,mention", 
    1542005015958605824: "qt", 
    1539294001731293184: "qt,mention"    
}

def test_extract_tweet_type(): 
    df = pd.read_csv("tests/data/test_tweets.csv")
    df["tweet_type"] = df.apply(lambda x: extract_tweet_type(x), axis=1)
    df.set_index("id", inplace=True)
    for id_, type_ in selected_tweet_ids_types.items():
        row = df.loc[id_]
        assert row.tweet_type == type_, f"failed tweet type for tweet `{id_}.` Should have been type '{type_}', but was '{row.tweet_type}'"
    