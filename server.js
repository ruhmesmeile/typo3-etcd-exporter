'use strict';

const PORT = 8080;
const HOST = "0.0.0.0";

const ETCDENDPOINT = `https://${process.env.MACHINEID}.etcd.services.ruhmesmeile.local:2379`;

const PROJECTKEY = process.env.TYPO3_PROJECTKEY;

const STATUS = {
  'stopped': 0,
  'installing': 1,
  'installed': 2,
  'starting': 3,
  'started': 4
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
  err ? console.log(err) : etcd.get(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/${currentStatus.node.value}`, function (err, timestamp) {
    err ? console.log(err) : typo3CurrentStatus.labels('typo3').set(STATUS[currentStatus.node.value], timestamp.node.value*1000);
  });
});

etcd.get(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/current`, function (err, currentStatus) {
  err ? console.log(err) : etcd.get(`/ruhmesmeile/projects/typo3/review/${PROJECTKEY}/status/typo3/${currentStatus.node.value}`, function (err, timestamp) {
    err ? console.log(err) : typo3CurrentStatus.labels('typo3').set(STATUS[currentStatus.node.value], timestamp.node.value*1000);
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
