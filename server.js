'use strict';

const PORT = 8080;
const HOST = '0.0.0.0';

const PROJECTKEY = process.env.TYPO3_PROJECTKEY;

const STATUS = {
  'stopped': 0,
  'installing': 1,
  'starting': 2,
  'started': 3,
}

const express = require('express');
const Prometheus = require('prom-client')

const Etcd = require('node-etcd');
const etcd = new Etcd("127.0.0.1:2379");

const app = express();

const typo3CurrentStatus = new Prometheus.Gauge({
  name: 'typo3_current_status',
  help: 'Current status of TYPO3 container',
  labelNames: ['service']
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

const typo3StatusWatcher = etcd.watcher(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/current`);
typo3StatusWatcher.on("change", function (value) {
  var timestamp = etcd.getSync(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/${value}`);
  typo3CurrentStatus.labels('typo3').set(STATUS[value], timestamp*1000);
});

app.listen(PORT, HOST);
console.log(`Metrics running on http://${HOST}:${PORT}/metrics`);

process.on('SIGTERM', () => {
  server.close((err) => {
    typo3StatusWatcher.stop();

    if (err) {
      console.error(err)
      process.exit(1)
    }

    process.exit(0)
  })
});
