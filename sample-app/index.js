var express = require('express');
var app = express();

// Import the Prometheus client + related libraries
var prometheusClient = require('prom-client');
const gcStats = require('prometheus-gc-stats');

// Collect Node.js metrics every 5s
prometheusClient.collectDefaultMetrics({timeout: 5000});

// Collect GC metrics from Node.js
const startGcStats = gcStats(prometheusClient.register);
startGcStats();

// Server metrics

// Summary metric for measuring request durations
const requestDurationSummary = new prometheusClient.Summary({
  name: 'sample_app_summary_request_duration_seconds',
  help: 'Summary of request durations',
  labelNames: ['method', 'statuscode'],
  percentiles: [0.5, 0.75, 0.9, 0.95, 0.99]
});

// Histogram metric for measuring request durations
const requestDurationHistogram = new prometheusClient.Histogram({
  name: 'sample_app_histogram_request_duration_seconds',
  help: 'Histogram of request durations',
  labelNames: ['method', 'statuscode'],

  // Experiment different bucket layouts
  buckets:  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  // buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 0.8, 1, 1.2, 1.5]
});

// CAUTION: The middlewares must be installed BEFORE the application routes
// you want to measure.

// This middleware measures the request duration with a Summary
app.use((req, res, next) => {
  const end = requestDurationSummary.startTimer();
  res.on('finish', () => {
    end({method: req.method, statuscode: res.statusCode});
  });
  next();
});

// This middleware measures the request duration with a Histogram
app.use((req, res, next) => {
  const end = requestDurationHistogram.startTimer();
  res.on('finish', () => {
    end({method: req.method, statuscode: res.statusCode});
  });
  next();
});

// Server routes

// Main route
app.get('/', async (req, res) => {
  // Simulate a 1s delay in ~5% of all requests
  if (Math.random() <= 0.05) {
    const sleep = (ms) => {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    };
    await sleep(1000);
  }
  res.send('Hello, world!');
});

// Expose the collected metrics via the /metrics endpoint
app.get('/metrics', (req, res) => {
  res.send(prometheusClient.register.metrics());
});

// Start the server
app.listen(4000);
