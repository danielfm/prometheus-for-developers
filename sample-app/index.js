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

  // CHANGEME: Experiment different bucket layouts for matching the latency
  // distribution more closely
  buckets:  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// SLO Metrics
const sloLatencyId = 'latency_p99_under_100ms';
const sloAvailabilityId = 'availability_p99_success';

// Request types for alerting purposes
const requestTypes = {
  CRITICAL:  'CRITICAL',  // Tightest SLO
  HIGH_FAST: 'HIGH_FAST', // SLO for high-availability and low-latency functionality
  HIGH_SLOW: 'HIGH_SLOW', // SLO for high-availability and high-latency functionality
  LOW:       'LOW',       // SLO for lower availability functionality
  NO_SLO:    'NO_SLO'     // Do not alert
};

// Counter for measuring the number of SLO-backed requests that hit the server
const sloRequestsCounter = new prometheusClient.Counter({
  name: 'slo_requests_total',
  help: 'Number of SLO-backed requests that hit the server',
  labelNames: ['slo_id', 'request_class']
});

// Counter for measuring the number of requests that violated a SLO
const sloErrorsCounter = new prometheusClient.Counter({
  name: 'slo_errors_total',
  help: 'Number of requests that violated the SLO',
  labelNames: ['slo_id', 'request_class']
});

// Set initial zero value for the SLO error counters
for (const reqTypeIdx in requestTypes) {
  const reqType = requestTypes[reqTypeIdx];

  sloErrorsCounter.inc({slo_id: sloAvailabilityId, request_class: reqType}, 0);
  sloErrorsCounter.inc({slo_id: sloLatencyId, request_class: reqType}, 0);
};

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

// This middleware tracks our SLOs
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const delta = process.hrtime(start);
    const durationSecs = delta[0] + delta[1] / 1e9;

    // Use the correct request type depending on the importance of the request
    const reqClass = requestTypes.CRITICAL;

    // Track served requests for each SLO
    sloRequestsCounter.inc({slo_id: sloAvailabilityId, request_class: reqClass});
    sloRequestsCounter.inc({slo_id: sloLatencyId, request_class: reqClass});

    // Latency SLO violation: request takes more than 100ms
    if (durationSecs > 0.1) {
      sloErrorsCounter.inc({slo_id: sloLatencyId, request_class: reqClass});
    }

    // Availability SLO violation: request returns HTTP 5xx
    if (res.statusCode >= 500 && res.statusCode <= 599) {
      sloErrorsCounter.inc({slo_id: sloAvailabilityId, request_class: reqClass});
    }
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
  res.set('Content-Type', 'text/plain');
  res.send('Hello, world!');
});

// Expose the collected metrics via the /metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(prometheusClient.register.metrics());
});

// Start the server
app.listen(4000);
