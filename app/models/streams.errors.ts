

export class StreamError extends Error {
    constructor(message: string) {
        super(message); // (1)
        this.name = "StreamError"; // (2)
    }
}