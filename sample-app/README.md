# Sample Node.js Application

This is a simple HTTP server for demonstrating the task of exposing
[Prometheus](https://prometheus.io) metrics.

## Running the Application

If you already have Node.js 8 installed on your machine, just run the following
command to start the server at <http://localhost:4000>:

```bash
$ npm i
$ node index
```

To run the application via `docker-compose`, go to the parent directory and run
the following command:

```bash
$ docker-compose up sample-app
```
