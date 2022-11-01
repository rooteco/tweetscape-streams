
import { TwitterApi } from "twitter-api-v2";
import { writeStreamListTweetsToNeo4j, getStreamByName } from "~/models/streams.server"

import { Queue } from "~/queue.server";

type QueueData = {
    bearerToken: string;
    streamName: string;
    sinceId: string;
};

const queue = Queue<QueueData>("notifier", async (job) => {
    // console.log(`Sending email to ${job.data.emailAddress}`);

    console.log("can i pass teh request object?")
    console.log(job.data.bearerToken)
    const streamName = job.data.streamName;
    const sinceId = job.data.sinceId
    const api = new TwitterApi(job.data.bearerToken)

    let { stream, creator, seedUsers } = await getStreamByName(streamName)
    writeStreamListTweetsToNeo4j(api, stream, 3, 100)

    console.log("HERE IS USER FROM INSIDE QUEUE")
    console.log(user)
    // Delay 1 second to simulate sending an email, be it for user registration, a newsletter, etc.
    // await new Promise((resolve) => setTimeout(resolve, 10000));

    // console.log(`Email sent to ${job.data.emailAddress}`);
});

export default queue