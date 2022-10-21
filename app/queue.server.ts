import {
    type Processor,
    Queue as BullQueue,
    Worker,
    QueueScheduler,
} from "bullmq";

import redis from "./redis.server";

type RegisteredQueue = {
    queue: BullQueue;
    worker: Worker;
    // scheduler: QueueScheduler;
};

declare global {
    var __registeredQueues: Record<string, RegisteredQueue> | undefined;
}

const registeredQueues = global.__registeredQueues || (global.__registeredQueues = {});

export function Queue<Payload>(name: string, handler: Processor<Payload>): BullQueue<Payload> {
    if (registeredQueues[name]) {
        return registeredQueues[name].queue;
    }

    const queue = new BullQueue<Payload>(name, { connection: redis });
    const worker = new Worker<Payload>(name, handler, { connection: redis });
    // const scheduler = new QueueScheduler(name, { connection: redis });

    // registeredQueues[name] = { queue, scheduler, worker };
    registeredQueues[name] = { queue, worker };

    return queue;
}