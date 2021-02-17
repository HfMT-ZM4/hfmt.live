
# hfmt.live
`hfmt.live` is a web-based platform aiming to enable creative uses of audio/video media streams, developed through by the [Hochschule für Musik und Theater Hamburg *Innovative Hochschule*](https://www.hfmt-hamburg.de/innovative-hochschule/), as part of the [Digital Stage](https://digital-stage.org/?lang=en) project, initiated during the Covid-19 pandemic, with additional generous support from [Digital Ocean](https://www.digitalocean.com/)'s Covid-19 development initiative.

The system provides a wrapper for WebRTC media streams using the [mediasoup](https://mediasoup.org/) Selective Forwarding Unit (SFU) as an underlying media router.

There is a default view for the page, but the system was designed to host user designed HTML pages (+CSS/JS), so the display layout and usage of the system has no (or very minimal) use restrictions.

JSON files may also be used, using the [drawsocket](https://github.com/HfMT-ZM4/drawsocket) system designed for dynamic score display.

### Installing Mediasoup

Note that on some systems, mediasoup may fail to install, if this happens, you may need to set change the default python to be python3, like:

`$ PYTHON=python3 npm install mediasoup@3 --save`


## Basic use
*please note: `hfmt.live` is very much an experimental developmental project! this code is possibly unstable and subject to change unexpectedly!*

The `hfmt.live` server uses the URL to specify a "room", where users may send and receive media streams, as well as messages via WebSockets, and may also share files with each other that change the view of the page.

For example, [https://hfmt.live/demo](https://hfmt.live/demo) enters the room "demo". Any user who enters the room "demo" can join and stream their audio and video. At the moment there is no authentication, but this may change in the nearish future.

### Default Page
In the default page, there are buttons for `Connect`, `Start Webcam`, `Share Score`, and `drawsocket-msg-out`.

* `connect`: connects to the room feeds, without starting the webcam.
* `start webcam`: opens the webcam and microphone, and joins the room media streams if not already joined.
* `share score`: send a file to all users in the room, either HTML or JSON file in [drawsocket](https://github.com/HfMT-ZM4/drawsocket) format. 
  
  On receiving a new file, the dropdown menu will be updated to include either the name of the HTML file, or a list of drawsocket prefixes included in the file (for example, there might be entries for different instruments in a score file). On selection of a prefix, or file, the display of the webpage will be updated with the instructions contained in the file.

* `drawsocket-msg-out`: clicking this button will open a text entry box that allows you to send drawsocket messages to the other users in the room, which can change the display in realtime.

### Custom Display

Alternatively, users may supply a URL parameter `get` to specify a page view file directly, circumventing the `Send Score` system.

For example, [https://hfmt.live/demo?get=https://raw.githubusercontent.com/HfMT-ZM4/hfmt.live/master/test-user-webgl.html](https://hfmt.live/demo?get=https://raw.githubusercontent.com/HfMT-ZM4/hfmt.live/master/test-user-webgl.html), enters the room namespace "demo", and request to load the file `test-user-webgl.html` stored in the `hfmt.live` GitHub repository. When users connect to the media stream, the video feeds are used as textures for an WebGL cube spinning on the page.

In this way, links can be used to set custom displays without needing the files to be stored locally on the server. Note, that the files need to be on servers that allow [Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), as used by the GitHub "raw" pages.

## API

The `hfmt.live` wrapper API uses of the [drawsocket](https://github.com/HfMT-ZM4/drawsocket) object, stored in the global `window` namespace, with some additional functions for handling media streams:

* `drawsocket.joinRoom()`: requests to join room and receive streams (could be used for viewers who only receive streams, without sending.

* `drawsocket.startStream()`: starts audio/video send stream to room, and automatically calls `joinRoom` if not already joined.

* `drawsocket.sendStream(stream, kind)`: lower level stream sending function, for use in situations where you want to process the streams before sending.
  * `stream`: the media stream
  * `kind`: a string, either `'video'` or `'audio'`, or if undefined, sendStream will attempt to use audio and video streams from the input `stream`.
  
  For example, for use with WebAudio:

  ```
  localMediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
  });

  await drawsocket.sendStream(localMediaStream, 'video');

  let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  let source = audioCtx.createMediaStreamSource(localMediaStream);
  let gainNode = audioCtx.createGain();
  let dest = audioCtx.createMediaStreamDestination();

  source.connect(gainNode);
  gainNode.connect(dest);

  await drawsocket.sendStream(dest.stream, 'audio');
  ```


* `drawsocket.getMediaStreams()`: returns an object of media streams, sorted by video and audio. Useful for initialization on load, to get list of current streams active in the room.
    ```
    {
        video: [ v_stream1, v_stream2, etc.],
        audio: [ a_stream1, a_stream2, etc.]        
    }
    ```
* `drawsocket.on_newPeerStream(stream, kind, id)`: callback function for handling new media streams. Returning a non-zero value prevents the default handler from being called. Arguments:
  * `stream`: the media stream object
  * `kind`: a string, either "audio" or "video"
  * `id`: the unique id associated with the user sending the stream.
 
  ```
  drawsocket.on_newPeerStream = async (stream, kind, id) => {
    return 1;
  }
  ```

* `drawsocket.on_newLocalStream(stream)`: callback function for handling new media streams created on the local machine. Returning a non-zero value prevents the default handler from being called. Arguments:
  * `stream`: the media stream object
  ```
  drawsocket.on_newLocalStream = async (stream) => {
    return 1;
  }
  ```

* `drawsocket.on_removedPeerStream(id)`: callback function for handling removal of media streams. Returning a non-zero value prevents the default handler from being called. Arguments:
  * `id`: the unique id associated with the user sending the stream.
  ```
  drawsocket.on_removedPeerStream = async (id) => {
    return 1;
  }
  ```

For a reference use case, please see [quintetnet-video.html](https://github.com/HfMT-ZM4/hfmt.live/blob/master/quintetnet-video.html).

## Installation on a new server

hfmt.live is currently running on a Digital Ocean Droplet, and may be used as a service there. The system is also fully open source, and so may be deployed on other servers. This repository includes all of the files required to install a new instance of the system on another Linux server, with the exception of the security key files. 

Documentation will be added here in the near future.


