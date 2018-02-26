'use strict';

const PORT = 8080;
const HOST = "0.0.0.0";

const ETCDENDPOINT = `https://${process.env.MACHINEID}.ttt.roles.addresses.services.ruhmesmeile.local:2379`;

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
const fs = require('fs');
var options = {
    ca:   fs.readFileSync('/etc/ssl/etcd/ca.pem'),
    cert: fs.readFileSync('/etc/ssl/etcd/calculonc.pem'),
    key:  fs.readFileSync('/etc/ssl/etcd/calculonc-key.pem')
};
const etcd = new Etcd(ETCDENDPOINT, options);
const app = express();

const typo3CurrentStatus = new Prometheus.Gauge({
  name: 'typo3_current_status',
  help: 'Current status of TYPO3 container',
  labelNames: ['service']
});

var value, timestamp;

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

const typo3StatusWatcher = etcd.watcher(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/current`);
typo3StatusWatcher.on("change", function (err, currentStatus) {
  etcd.get(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/${currentStatus}`, function (err, value) {
    typo3CurrentStatus.labels('typo3').set(STATUS[currentStatus], timestamp*1000);
  });
});

etcd.get(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/current`, function (err, currentStatus) {
  etcd.get(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/${currentStatus}`, function (err, timestamp) {
    console.log(`Debug: ${currentStatus.toString()}, ${timestamp.toString()}`);
    typo3CurrentStatus.labels('typo3').set(STATUS[currentStatus], timestamp*1000);
  });
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
