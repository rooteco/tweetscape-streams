import { Queue } from "~/queue.server";

type QueueData = {
    emailAddress: string;
};

const queue = Queue<QueueData>("notifier", async (job) => {
    console.log(`Sending email to ${job.data.emailAddress}`);

    // Delay 1 second to simulate sending an email, be it for user registration, a newsletter, etc.
    await new Promise((resolve) => setTimeout(resolve, 10000));

    console.log(`Email sent to ${job.data.emailAddress}`);
});

export default queue
