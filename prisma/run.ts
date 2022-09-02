interface customObject {
    [key: string]: any;
    // public_metrics_followers_count: Number
}


export function run() {
    let followingObj: customObject = {}

    let seedUsers: Array<customObject> = [
        { "username": "nicktorba" },
        { "username": "rhyslindmark" },
        { "username": "visakanv" }
    ];

    let follows = ["hello", "goodbye"];

    for (let seedUser of seedUsers) {
        follows.map((i: any) => {
            if (followingObj[i]) {
                followingObj[i].push(seedUser["username"]);
            } else {
                followingObj[i] = [seedUser["username"]]
            }
        });
    }

    console.log(followingObj);
}
run()