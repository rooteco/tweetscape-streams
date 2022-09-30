import type { Driver} from 'neo4j-driver';
import neo4j, { Session } from 'neo4j-driver'
// import { int, isInt } from 'neo4j-driver'

let driver: Driver;

// declare global {
//     var __neo4jClient__: Driver;
// }

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// in production we'll have a single connection to the DB.
// if (process.env.NODE_ENV === "production") {
//     driver = initDriver(
//         process.env.NEO4J_URI,
//         process.env.NEO4J_USERNAME,
//         process.env.NEO4J_PASSWORD
//     );
// } else {
//     if (!global.__db__) {
//         global.__neo4jClient__ = initDriver();
//     }
//     driver = global.__neo4jClient__;
// }

function initDriver(uri: string, username: string, password: string) {
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password))

    // Verify connectivity
    return driver.verifyConnectivity()
        // Resolve with an instance of the driver
        .then(() => driver)
}
export function closeDriver() {
    return driver && driver.close()
}

initDriver(
    process.env.NEO4J_URI,
    process.env.NEO4J_USERNAME,
    process.env.NEO4J_PASSWORD
);
export { driver };