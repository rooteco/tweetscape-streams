import { faker } from "@faker-js/faker";

describe("streams tests", () => {
    it("should allow you to register and login", () => {

        cy.visitAndCheck("/");
        cy.findByRole("link", {
            name: /Streams/i
        }).click()
        cy.contains("Build Tweetscape Streams!")
    });

    it("login with twitter", () => {
        // cy.findByRole("link", { name: /oauth/i }).click()
        // cy.contains()
        cy.visit("https://twitter.com/i/oauth2/authorize?response_type=code&client_id=dHJXUFFRRW9qdVVGN0J0cGhxWWo6MTpjaQ&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fstreams&state=VTQQcGoghAWRe8D.YstKrJuNBIO~LIgU&code_challenge=_DaC00eNWw-VSbRyJmskcduUwbhX2QkDWlfLZBixR9A&code_challenge_method=s256&scope=tweet.read%20tweet.write%20users.read%20follows.read%20follows.write%20offline.access%20like.read%20like.write%20list.read%20list.write")
        cy.get('div[data-testid="OAuth_Consent_Button"]')
        // cy.findByRole(
        //     "button"
        // )
        // // cy.get("div[data-testid=Oauth_Consent_Button]")
        // cy.findByRole("button", {
        //     name: /})
    })

    it("test stream creation", () => {
        cy.get('input[name=name]').type("test-stream-creation")
        cy.get('button[type=submit]').click()
        cy.contains("test-stream-creation");
        cy.contains("Seed Users");
    })

    it("test streams delete", () => {
        cy.get('button[value=delete]').click()
        cy.contains("Create New Stream")
    })

});
