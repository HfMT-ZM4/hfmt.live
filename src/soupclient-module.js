/**
 * note: looks like consumers is only used to keep consumers in scope, 
 * but isn't updated when they are removed, this is probably a memory leak but in most cases will not be an issue
 */

'use strict';

import * as mediasoup from "mediasoup-client";

const CAM_VIDEO_SIMULCAST_ENCODINGS =
    [
        { maxBitrate: 96000, scaleResolutionDownBy: 4 },
        { maxBitrate: 680000, scaleResolutionDownBy: 1 },
    ];


let remoteMediaStreams = { 
    audio: {},
    video: {}
};

/**
 * returns remoteMediaStreams obj
 *   { 
 *       audio: {},
 *       video: {}
 *   }
 */
export function getStreams() {
    return remoteMediaStreams;
}

/**
 * 
 * @param {required: socket.io instance, i.e. io() } _socket 
 */
export function init(_socket) 
{

    socket = _socket;

    socket.request = (type, data = {}) => {
        return new Promise((resolve) => {
            socket.emit(type, data, resolve);
        });
    };

    socket.on('connect', () => {
        socketID = socket.id ;

        if( socketID.lastIndexOf('#') != -1 )
        {
            socketID = socketID.substr(socketID.lastIndexOf('#')+1);
        }


        let url_args = new URLSearchParams(window.location.search);      
        let usrArg = url_args.get('id');  
        if( usrArg ){
            socketID += `-id-${usrArg}`;
            console.log( `soupe socket adding userArg ${usrArg}`);
        }

        console.log(`connected, with logged socket ID ${socketID}`);
        
    });

    socket.on('sync-peers', (data) => {
        lastPollSyncData = data;
        console.log('sync-peers got', data, Date.now() );
        updateStreamConsumers();
    });

    socket.on('remove-peer', (data) => {
        const { removePeerId } = data;

        removePeerStream(removePeerId);
        on_removedPeerStream(removePeerId);
    });
}

function removePeerStream(id)
{
    delete remoteMediaStreams.audio[id];
    delete remoteMediaStreams.video[id];
}


/**
 * start mediasoup device, on_joinedRoom() callback on completion
 */
export async function joinRoom() 
{
    if (joined)
        return;

    try {
        device = new mediasoup.Device();

        const { routerRtpCapabilities } = await socket.request('join-as-new-peer');

        await device.load({ routerRtpCapabilities });
        console.log('loaded mediasoup device!', routerRtpCapabilities);

        joined = true;

        if (!device.canProduce('audio')) {
            console.error('mediasoup cannot produce audio for some reason');
        }

        on_joinedRoom();

        if (!recvTransport) {
            recvTransport = await createTransport('recv');
        }

        console.log('sync-peers-request');

        lastPollSyncData = await socket.request('sync-peers-request');
        updateStreamConsumers();


    }
    catch (error) {
        console.error(`load errer ${error}`);
    }
}


export async function leaveRoom() {

    if (!joined) {
        return;
    }

    // close everything on the server-side (transports, producers, consumers)
    let { error } = await socket.request('leave');
    if (error) {
        err(error);
    }
    
    try {
        recvTransport && await recvTransport.close();
        sendTransport && await sendTransport.close();
    } catch (e) {
        console.error(e);
    }

    recvTransport = null;
    sendTransport = null;
    camVideoProducer = null;
    camAudioProducer = null;
    screenVideoProducer = null;
    screenAudioProducer = null;
    localMediaStream = null;
    localScreen = null;
    lastPollSyncData = {};
    consumers = [];
    joined = false;
}

/**
 * 
 * @param {required: audio/video medeia stream to send} _stream 
 * @param {optional: string, 'video', 'audio' to set sream type, default is undefined, which will use audio and video from same stream}
 */
export async function sendStream(_stream, kind) 
{
    await joinRoom();

    if (!sendTransport) 
        sendTransport = await createTransport('send');

    if( typeof kind == "undefined" || kind == "video" )
    {
        console.log('local video settings', _stream.getVideoTracks()[0].getSettings());

        camVideoProducer = await sendTransport.produce({
            track: _stream.getVideoTracks()[0],
            encodings: camEncodings(),
            appData: { mediaTag: 'cam-video' }
        });    
    }

    /*
        dataProducer = await sendTransport.produceData({
        });
    */

    if( typeof kind == "undefined" || kind == "audio" )
    {
        console.log('local audio settings', _stream.getAudioTracks()[0].getSettings());

        camAudioProducer = await sendTransport.produce({
            track: _stream.getAudioTracks()[0],
            appData: { mediaTag: 'cam-audio' }
        });
    }


}


export async function pauseAudioSend(){ 
    pauseProducer(camAudioProducer);
}

export async function pauseVideoSend(){ 
    pauseProducer(camVideoProducer);
}

export async function resumeAudioSend()
{
    resumeProducer(camAudioProducer);
}

export async function resumeVideoSend()
{
    resumeProducer(camVideoProducer);
}

export function on_joinedRoom() {}

export function on_removedPeerStream(_id) {}

export function on_newPeerStream(_stream, _type, _id) {}


// ---- internal

let socket;

const log = console.log;

let socketID;

let device,
    joined,
    localMediaStream,
    localScreen,
    recvTransport,
    sendTransport,
    camVideoProducer,
    camAudioProducer,
    screenVideoProducer,
    screenAudioProducer,
    currentActiveSpeaker = {},
    lastPollSyncData = {},
    pollingInterval,
    consumers = [];


// consumers are links to peers, stored by id
// the consumers are links to the media streams, produced by the transport

async function sleep(ms) {
    return new Promise((r) => setTimeout(() => r(), ms));
}

async function updateStreamConsumers(peersInfo = lastPollSyncData) {
    //    const data = await socket.request('sync-peer-request');

    if (!joined)
        return;

    console.log('peersInfo', peersInfo);

    if (!peersInfo.hasOwnProperty('peers'))
        return;

    const peerArray = peersInfo.peers;

    if (!Array.isArray(peerArray)) {
        if (Object.keys(peerArray).length === 0) {
            return;
        }
        peerArray = [peepeerArraysInfo];

    }

    for (let peer of peerArray) 
    {
        if (peer.id === socketID) {
            //            console.log('skip our own stream');
            continue;
        }

        console.log('peer', peer);

        if (Object.keys(peer.media).length > 0) 
        {
            for (let [mediaTag, info] of Object.entries(peer.media)) 
            {
                await subscribeToTrack(peer.id, mediaTag);
                //          console.log('available-track', peer.id, mediaTag, info);
            }
        }

    }

}


function camEncodings() {
    return CAM_VIDEO_SIMULCAST_ENCODINGS;
}

// how do we limit bandwidth for screen share streams?
//
function screenshareEncodings() {
    null;
}

async function getCurrentAudioDeviceId() {
    if (!camAudioProducer) {
        return null;
    }
    let deviceId = camAudioProducer.track.getSettings().deviceId;
    if (deviceId) {
        console.log('got device id from camAudioProducer', camAudioProducer.track);
        return deviceId;
    }
    // Firefox doesn't have deviceId in MediaTrackSettings object
    let track = localMediaStream && localMediaStream.getAudioTracks()[0];
    if (!track) {
        return null;
    }
    let devices = await navigator.mediaDevices.enumerateDevices(),
        deviceInfo = devices.find((d) => d.label.startsWith(track.label));
    return deviceInfo.deviceId;
}


async function getCurrentVideoDeviceId() {
    if (!camVideoProducer) {
        return null;
    }
    let deviceId = camVideoProducer.track.getSettings().deviceId;
    if (deviceId) {
        console.log('got device id from camVideoProducer');
        return deviceId;
    }
    // Firefox doesn't have deviceId in MediaTrackSettings object
    let track = localMediaStream && localMediaStream.getVideoTracks()[0];
    if (!track) {
        return null;
    }
    let devices = await navigator.mediaDevices.enumerateDevices(),
        deviceInfo = devices.find((d) => d.label.startsWith(track.label));
    return deviceInfo.deviceId;
}


// utility function to create a transport and hook up signaling logic
// appropriate to the transport's direction
//
async function createTransport(direction) {
    //    log(`create ${direction} transport`);

    // ask the server to create a server-side transport object and send
    // us back the info we need to create a client-side transport
    let transport;
    const data = await socket.request('create-transport', { direction });
    if (data.error) {
        log('failed to create trasport on server', data.error);
        return;
    }

    let { transportOptions } = data;
    log('transport options', transportOptions);

    if (direction === 'recv') {
        transport = await device.createRecvTransport(transportOptions);
    }
    else if (direction === 'send') {
        transport = await device.createSendTransport(transportOptions);
    }
    else {
        throw new Error(`bad transport 'direction': ${direction}`);
    }

    // mediasoup-client will emit a connect event when media needs to
    // start flowing for the first time. send dtlsParameters to the
    // server, then call callback() on success or errback() on failure.
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {

        log('transport connect event', direction);
        let { error } = await socket.request('connect-transport', {
            transportId: transportOptions.id,
            dtlsParameters
        });
        if (error) {
            log('error connecting transport', direction, error);
            errback();
            return;
        }
        callback();
    });

    if (direction === 'send') {
        // sending transports will emit a produce event when a new track
        // needs to be set up to start sending. the producer's appData is
        // passed as a parameter
        transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
            log('transport produce event', appData.mediaTag);

           
            let paused = false;
            
            // tell the server what it needs to know from us in order to set
            // up a server-side producer object, and get back a
            // producer.id. call callback() on success or errback() on
            // failure.
            let { error, id } = await socket.request('send-track', {
                transportId: transportOptions.id,
                kind,
                rtpParameters,
                paused,
                appData
            });
            if (error) {
                log('error setting up server-side producer', error);
                errback();
                return;
            }
            callback({ id });
        });
    }

    // for this simple demo, any time a transport transitions to closed,
    // failed, or disconnected, leave the room and reset
    //
    transport.on('connectionstatechange', async (state) => {
        log(`transport ${transport.id} connectionstatechange ${state}`);
        // for this simple sample code, assume that transports being
        // closed is an error (we never close these transports except when
        // we leave the room)
        if (state === 'closed' || state === 'failed' || state === 'disconnected') {
            log('transport closed ... leaving the room and resetting');
            leaveRoom();
        }
        else if (state == 'connected') {

        }
    });

    console.log('fished transport setup');
    return transport;
}

function findConsumerForTrack(peerId, mediaTag) {
    for (const c of consumers) {
        log('consumer peer id', c.appData.peerId, peerId);
        if (c.appData.peerId == peerId &&
            c.appData.mediaTag == mediaTag) {
            return c;
        }
    }
}

// note: maybe only subscribe if we don't already have a consumer
async function subscribeToTrack(peerId, mediaTag) {
    log('subscribe to track', peerId, mediaTag);

    // create a receive transport if we don't already have one
    if (!recvTransport) {
        recvTransport = await createTransport('recv');
    }

    // if we do already have a consumer, we shouldn't have called this
    // method
    let consumer = findConsumerForTrack(peerId, mediaTag);
    if (consumer) {
        log('already have consumer for track', peerId, mediaTag)
        return;
    };

    //  log(`consumer not found for ${peerId}, ${JSON.stringify(consumers, null, 2)}`);
    // ask the server to create a server-side consumer object and send
    // us back the info we need to create a client-side consumer
    let consumerParameters = await socket.request('recv-track', {
        mediaTag,
        mediaPeerId: peerId,
        rtpCapabilities: device.rtpCapabilities
    });
    log('consumer parameters', consumerParameters);

    consumer = await recvTransport.consume({
        ...consumerParameters,
        appData: { peerId, mediaTag }
    });
    log('created new consumer', consumer.id);

    // the server-side consumer will be started in paused state. wait
    // until we're connected, then send a resume request to the server
    // to get our first keyframe and start displaying video
    while (recvTransport.connectionState !== 'connected') 
    {
        log(' sleeping while transport connstate', recvTransport.connectionState);
        await sleep(100);
    }
    // okay, we're ready. let's ask the peer to send us media
    await resumeConsumer(consumer);


    if (!(consumer && consumer.track)) 
    {
        console.error('consumer failure!');
        return;
    }

    // keep track of all our consumers
    consumers.push(consumer);

    let newStream = new MediaStream([consumer.track.clone()]);
    remoteMediaStreams[consumer.kind][peerId] = newStream;

    // callback to add new stream
    on_newPeerStream(newStream, consumer.kind, peerId);

}



async function pauseConsumer(consumer) {
    if (consumer) {
        log('pause consumer', consumer.appData.peerId, consumer.appData.mediaTag);
        try {
            await socket.request('pause-consumer', { consumerId: consumer.id });
            await consumer.pause();
        } catch (e) {
            console.error(e);
        }
    }
}

async function resumeConsumer(consumer) {
    if (consumer) {
        log('resume consumer', consumer.appData.peerId, consumer.appData.mediaTag);
        try {
            await socket.request('resume-consumer', { consumerId: consumer.id });
            await consumer.resume();
        } catch (e) {
            console.error(e);
        }
    }
}

async function pauseProducer(producer) {
    if (producer) {
        log('pause producer', producer.appData.mediaTag);
        try {
            await socket.request('pause-producer', { producerId: producer.id });
            await producer.pause();
        } catch (e) {
            console.error(e);
        }
    }
}

async function resumeProducer(producer) {
    if (producer) {
        log('resume producer', producer.appData.mediaTag);
        try {
            await socket.request('resume-producer', { producerId: producer.id });
            await producer.resume();
        } catch (e) {
            console.error(e);
        }
    }
}
