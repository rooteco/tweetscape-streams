

1) update app name in the fly.toml
2. fly launch 
    * enter app name: tweetscape-timeline-by-tags
    * when prompted "would you like to setup a Postgressql database now? hit Y


fly secrets set ... comand in timeline-by-tags-app-and-db.env (ignored file)

fly postgres create -a tweetscape-timelinge-by-tags-db 

fly proxy 15432:5432 -a tweetscape-timline-by-topics-db

set DATABASE_URL in  .env
```
DATABASE_URL=
```


prisma migrate dev --name init 
