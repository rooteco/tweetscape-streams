
import { TwitterApi } from 'twitter-api-v2';



// const client = new TwitterApi({ clientId: "dHJXUFFRRW9qdVVGN0J0cGhxWWo6MTpjaQ", clientSecret: "a6iS1cwz3gdL21UYWZVg0-q_4QdyKr127VlIDq4ssWmxKgQNR7" });

const api = new TwitterApi("AAAAAAAAAAAAAAAAAAAAAFM3agEAAAAAZBujrfV2sgBQJXadn39uUwXpF2M%3DorQ010miN3ctmdfCcjFDBhh32fNb9xGd74YDo4V4lPOZ6oL8Zf");

async function lookup() {
    const users = await api.v2.userByUsername("nicktorba");
    console.log(users);
}

lookup();