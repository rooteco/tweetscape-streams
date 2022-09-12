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

const api = new TwitterApi("AAAAAAAAAAAAAAAAAAAAAFM3agEAAAAAZBujrfV2sgBQJXadn39uUwXpF2M%3DorQ010miN3ctmdfCcjFDBhh32fNb9xGd74YDo4V4lPOZ6oL8Zf");

function flattenTwitterData(data: Array<any>) {
    for (const obj of data) {
        obj.username = obj.username.toLowerCase();
        obj["public_metrics.followers_count"] = obj.public_metrics.followers_count;
        obj["public_metrics.following_count"] = obj.public_metrics.following_count;
        obj["public_metrics.tweet_count"] = obj.public_metrics.tweet_count;
        obj["public_metrics.listed_count"] = obj.public_metrics.listed_count;
        delete obj.public_metrics;
        delete obj.entities;
    }
    return data;
}

async function createUser(driver: any, userData: any) {
    // Create a Session for the `people` database
    const session = driver.session()

    // Create a node within a write transaction
    const res = await session.writeTransaction((tx: any) => {
        console.log("here is the userData:")
        console.log(userData);
        return tx.run(
            `MERGE (u:TwitterUserNew {username: 'nicktorba'}) 
                SET u = $user
                RETURN u`,
            { user: userData }
        )
    })

    // Get the `p` value from the first record
    const p = res.records[0].get('u')
    console.log(Object.keys(p));
    console.log(p.properties['public_metrics.tweet_count'])
    console.log()
    console.log("here is p:");
    console.log(p)
    // Close the sesssion
    await session.close()

    // Return the properties of the node
    console.log(p.properties)
    return p.properties
}


async function run() {
    driver = await initDriver(

    )
    const data = await api.v2.usersByUsernames(
        ["nicktorba", "rhyslindmark"],
        { 'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld', }
    );
    // console.log(flattenTwitterData([data.data[0]])[0]);

    data.data.map(async (user) => {
        console.log('ehre is flat data');
        user = flattenTwitterData([user])[0]
        console.log(user)
        await createUser(driver, user);
    })
    closeDriver();
    console.log("closing this shit");
}
run();

