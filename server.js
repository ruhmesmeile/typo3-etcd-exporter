'use strict';

const PORT = 8080;
const HOST = "0.0.0.0";

const ETCDENDPOINT = `https://${process.env.MACHINEID}.etcd.services.ruhmesmeile.local:2379`;

const PROJECTKEY = process.env.TYPO3_PROJECTKEY;
const STAGE = process.env.TYPO3_STAGE;
const SERVICES = process.env.TYPO3_SERVICES.split(',');
const REQUIRED_SERVICES = process.env.TYPO3_REQUIRED_SERVICES.split(',');

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

const typo3CurrentStatus = new Prometheus.Gauge({
  name: 'typo3_current_status',
  help: 'Current status of TYPO3 system',
  labelNames: ['service']
});

const typo3StatusCounter = new Prometheus.Counter({
  name: 'typo3_status_counter',
  help: 'Counter for number of status changes, timestamped',
  labelNames: ['service','status']
});

var getStatusName = function getStatusName (name) {
  var retVal;

  if (name.indexOf('stopped') > -1) {
    retVal = 'stopped';
  } else if (name.indexOf('installing') > -1) {
    retVal = 'installing';
  } else {
    retVal = name;
  }

  return retVal;
};

const app = express();
app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

REQUIRED_SERVICES.forEach(function (serviceName) {
  etcd.set(`/ruhmesmeile/projects/typo3/${STAGE}/${PROJECTKEY}/status/${serviceName}/current`, 'stopped', console.log);
});

var watcher;
var watchers = [];

SERVICES.forEach(function (serviceName) {
  var handleEtcdResult = function handleEtcdResult (err, currentStatus) {
    if (err) {
      console.log(err);
    } else {
      typo3CurrentStatus.labels(serviceName).set(STATUS[getStatusName(currentStatus.node.value)]);

      etcd.get(`/ruhmesmeile/projects/typo3/${STAGE}/${PROJECTKEY}/status/${serviceName}/${getStatusName(currentStatus.node.value)}`, function (err, timestamp) {
        err ? console.log(err) : typo3StatusCounter.labels(serviceName, getStatusName(currentStatus.node.value)).inc(1, new Date(timestamp.node.value*1000));
      })
    }
  };

  watcher = etcd.watcher(`/ruhmesmeile/projects/typo3/${STAGE}/${PROJECTKEY}/status/${serviceName}/current`);
  watcher.on("change", function (value) { handleEtcdResult(null, value); });
  watchers.push(watcher);

  etcd.get(`/ruhmesmeile/projects/typo3/${STAGE}/${PROJECTKEY}/status/${serviceName}/current`, handleEtcdResult);
});

app.listen(PORT, HOST);
console.log(`Metrics running on http://${HOST}:${PORT}/metrics`);

process.on('SIGTERM', () => {
  server.close((err) => {
    watchers.forEach(function (watcher) {
      watcher.stop();
    });

    if (err) {
      console.error(err)
      process.exit(1)
    }

    process.exit(0)
  })
});
