import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';
import neo4j, { Session } from 'neo4j-driver'
import { int, isInt } from 'neo4j-driver'

let driver: any;

async function initDriver(uri: string, username: string, password: string) {
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password))

    // Verify connectivity
    return driver.verifyConnectivity()
        // Resolve with an instance of the driver
        .then(() => driver)
}

export function closeDriver() {
    return driver && driver.close()
}



const api = new TwitterApi("");

function flattenTwitterData(data: Array<any>) {
    for (const obj of data) {
        obj.username = obj.username.toLowerCase();
        obj.public_metrics_followers_count = obj.public_metrics.followers_count;
        obj.public_metrics_following_count = obj.public_metrics.following_count;
        obj.public_metrics_tweet_count = obj.public_metrics.tweet_count;
        obj.public_metrics_listed_count = obj.public_metrics.listed_count;
        delete obj.public_metrics;
        delete obj.entities;
    }
    return data;
}

async function readTweets(driver: any) {
    // Create a Session for the `people` database
    const session = driver.session()

    // Create a node within a write transaction
    const res = await session.writeTransaction((tx: any) => {
        return tx.run(
            `MATCH (u:User {username: 'nicktorba'})-[:POSTED]->(t:Tweet) Return t`
        )
    })

    // Get the `p` value from the first record
    const p = res.records[0].get('t')
    console.log(Object.keys(p));
    // console.log(p.properties.public_metrics_listed_count.toNumber())
    console.log()
    console.log("here is p:");
    console.log(p)
    // Close the sesssion
    await session.close()

    // Return the properties of the node
    // console.log(p.properties)
    return p.properties
}


async function run() {
    driver = await initDriver(

    )

    await readTweets(driver);
    closeDriver();
    console.log("closing this shit");
}
run();

