// currently using the examples found online, but probably we don't want to await in the main server loop here

'use strict';

const http  = require('http');
const express = require('express');
const socketio = require('socket.io');
const mediasoup = require('mediasoup');
const soupconfig = require('./mediasoup.config');

const Room = require('./room')

/*
  maybe use the args from pm2 later to run multiple servers in parallel
  currently not used
*/
const parseArgs = require('minimist');
const args = parseArgs(process.argv.slice(2));
const { name = 'default', port = '8080'} = args;

const app = express();
const server = http.createServer(app);
const io = socketio(server);


let worker, router, room, audioLevelObserver;

// log all of this per client eventually
let producer;// = { id: 'default' };
let consumer;
let producerTransport;
let consumerTransport;


async function startMediasoup() 
{
  let _worker = await mediasoup.createWorker({
    logLevel: soupconfig.worker.logLevel,
    logTags: soupconfig.worker.logTags,
    rtcMinPort: soupconfig.worker.rtcMinPort,
    rtcMaxPort: soupconfig.worker.rtcMaxPort,
  });

  _worker.on('died', () => {
    console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', _worker.pid);
    setTimeout(() => process.exit(1), 2000);
  });

  const mediaCodecs = soupconfig.router.mediaCodecs;
  const _router = await _worker.createRouter({ mediaCodecs });
 
//  console.log(`created router with rtpCapabilities: ${JSON.stringify(_router.rtpCapabilities, null, 2)}`);
 
    // audioLevelObserver for signaling active speaker
  //
  const _audioLevelObserver = await _router.createAudioLevelObserver({
		interval: 800
	});
  _audioLevelObserver.on('volumes', (volumes) => {
    const { producer, volume } = volumes[0];
    log('audio-level volumes event', producer.appData.peerId, volume);
    roomState.activeSpeaker.producerId = producer.id;
    roomState.activeSpeaker.volume = volume;
    roomState.activeSpeaker.peerId = producer.appData.peerId;
  });
  _audioLevelObserver.on('silence', () => {
    log('audio-level silence event');
    roomState.activeSpeaker.producerId = null;
    roomState.activeSpeaker.volume = null;
    roomState.activeSpeaker.peerId = null;
  });

 return { _worker, _router, _audioLevelObserver }; //, 

}

async function createWebRtcTransport({ peerId, direction }) {
  const {
    listenIps,
    initialAvailableOutgoingBitrate
  } = soupconfig.webRtcTransport;

  const transport = await router.createWebRtcTransport({
    listenIps: listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate,
    appData: { peerId, clientDirection: direction }
  });

  return transport;
}


async function main()
{
  console.log('starting mediasoup');
  let soup = await startMediasoup();

	worker = soup._worker;
	router = soup._router;
	audioLevelObserver = soup._audioLevelObserver;

console.log(`created router with rtpCapabilities: ${JSON.stringify(router.rtpCapabilities, null, 2)}`);

  await new Promise((resolve) => {
    server.listen(3001, '0.0.0.0', () => {
      console.log(`started server, routing from nginx on port 3001`);
      resolve();
    });
  });

  room = new Room();

}

// consider using socket.io rooms:
// https://socket.io/docs/rooms-and-namespaces/


io.on('connection', (socket) => {

  console.log("New connection from " + socket.id);

  socket.on('heartbeat', (payload) => {
    payload.nodeName = name;
    socket.emit('heartbeat', payload);
  });

  socket.on('sync', (data, callback) => {
    callback( {peerIds: room.getIds() } );
  });

  socket.on('join-as-new-peer', (data, callback) => {
    room.addPeer(socket.id, socket);
    socket.broadcast.emit('new-peer');
    callback( { routerRtpCapabilities: router.rtpCapabilities });
  });


  socket.on('connect-transport', (data, callback) => {
    try {
      let { peerId, transportId, dtlsParameters } = data;

      let transport = room.transports[transportId];
  
      if (!transport) 
      {
        err(`connect-transport: server-side transport ${transportId} not found`);
        callback({ error: `server-side transport ${transportId} not found` });
        return;
      }
  
      log('connect-transport', peerId, transport.appData);
  
      await transport.connect({ dtlsParameters });
      res.send({ connected: true });
    } catch (e) {
      console.error('error in /signaling/connect-transport', e);
      res.send({ error: e });
    }
  });



  socket.on('create-transport', async (data, callback) => {
    try {
      let { peerId, direction } = data;
      log('create-transport', peerId, direction);

      let transport = await createWebRtcTransport({ peerId, direction });
      room.transports[transport.id] = transport;

      let { id, iceParameters, iceCandidates, dtlsParameters } = transport;
      
      callback({
        transportOptions: { id, iceParameters, iceCandidates, dtlsParameters }
      });

    } catch (e) {
      console.error('error in /signaling/create-transport', e);
      callback({ error: e });
    }
  });


main();




/*

app.get('/', (req, res) => {
  res.send('failed to route static from nginx');
});

// api folder test
app.get('/api/test', (req, res) => {
  res.json({
    headers: req.headers,
    address: req.connection.remoteAddress
  });
});

app.get('/api/name', (req, res) => {
 // console.log('received req');
  res.send('hello api/name');
});
*/
