
import * as soupclient from './soupclient-module';
import io from 'socket.io-client';
import * as drawsocket from './drawsocket-web';

const socket = io();
soupclient.init(socket);
drawsocket.init(socket);

window.drawsocket = drawsocket;

const hostname = window.location.hostname;
const $ = document.querySelector.bind(document);

let localMediaStream;

socket.on('room-message', (data) => {
    console.log(data)
    if( data.hasOwnProperty('file') )
    {
        console.log(data.file);
        
        for(let i = 0; i < data.file.length; i++)
        {

            console.log(typeof data.file[i], data.file[i]);

            let file = arrayBufferToString( data.file[i] );
            console.log(typeof file);
            
            if( file.type === "application/json" )
            {
                let reader = new FileReader();
                reader.readAsText(file);
    
                reader.onload = function() {
                    processFile( JSON.parse(reader.result) );
                };
    
                reader.onerror = function() {
                    console.log(reader.error);
                };
                
            }
            else
            {
                console.log(file);
            }

            /*
            if( file.type == "application/json")
            {
                
                processFile( fileToObj(file) );
            }
            */

        }
/*
        data.file.forEach(f => {
            //if( f.type === "application/json" )
        });
  */      
    }
    else
    {
        drawsocket.input(data);
    }
});


function fileToObj(file)
{
    if ('TextDecoder' in window) {
        var dataView = new DataView(file);
        var decoder = new TextDecoder('utf8');
        var obj = JSON.parse(decoder.decode(dataView));
        return obj;
    } else {
        var decodedString = String.fromCharCode.apply(null, new Uint8Array(file));
        var obj = JSON.parse(decodedString);
        return obj;
    }

}

function arrayBufferToString(file)
{
    if ('TextDecoder' in window) {
        var dataView = new DataView(file);
        var decoder = new TextDecoder('utf8');
        var obj = decoder.decode(dataView); //<< not parsing since it could be another type?
        return obj;
    } else {
        var obj = String.fromCharCode.apply(null, new Uint8Array(file));
        return obj;
    }

}


function processFile(obj)
{
   // let obj = fileToObj(file);
//    console.log(`received json ${JSON.stringify(obj, null, 2)}`);
    
    let menu = $('#select_part');
    menu.innerHTML = "";

    let el1 = document.createElement('option');
    el1.value = "";
    el1.innerHTML = "--Please select a part to display--";
    menu.appendChild(el1);

    Object.keys(obj).forEach( key => {
        let el = document.createElement('option');
        el.value = key;
        el.innerHTML = key;
        menu.appendChild(el);
    });

    menu.addEventListener('change', (event) => {
        console.log('loading event.target.value');
        
        drawsocket.input(obj[event.target.value]);
    });

}


async function handleFiles()
{
    const file = this.files[0];
    console.log(this.files, this.files.length);
    
    socket.emit('room-message', {
        file: this.files
    });

    return;
    
    let fileArray = [];
    for( let i = 0; i < this.files.length; i++)
    {
        let file = this.files[i];
        console.log(file);
        
        socket.emit('room-message', {
            file: file
        });

        if( file.type === "application/json" )
        {
            let reader = new FileReader();
            reader.readAsText(file);

            reader.onload = function() {
                processFile( JSON.parse(reader.result) );
            };

            reader.onerror = function() {
                console.log(reader.error);
            };
            
        }

        //fileArray.push(this.files[i]);
    }
/*
    socket.emit('room-message', {
        file: fileArray
    });
*/


    

}


soupclient.on_joinedRoom = ()=>{
    $('#btn_connect').disabled = true;
}

soupclient.on_newPeerStream = async (stream, kind, id) => {

    const tag = kind + '-' + id;
    if ($('#' + tag)) {
        console.log('already have tag');
        return;
    }

    let el = document.createElement(kind);
    el.setAttribute('playsinline', '');
    el.setAttribute('autoplay', '');
    //el.setAttribute('muted', '');
    //el.setAttribute('controls', true);

    el.id = tag;

    el.srcObject = stream;

    $(`#videos`).appendChild(el);

    await el.play()
        .catch((error) => {
            console.error('elememt failed to play:', error, el);
            el.setAttribute('controls', '');
        });
}


soupclient.on_removedPeerStream = (_id) => {
    document.querySelectorAll(`#video-${_id}`).forEach(e => {
        e.parentNode.removeChild(e);
    });

    document.querySelectorAll(`#audio-${_id}`).forEach(e => {
        e.parentNode.removeChild(e);
    });
}

// to do: set audio and video stream devices

async function startStream() 
{
    if (localMediaStream)
        return;

    try {
        localMediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

    }
    catch (e) {
        console.error('start camera error', e);
    }

    await soupclient.sendStream(localMediaStream);


    //$('#stop-streams').style.display = 'initial';
    showCameraInfo();
    let display = $('#localVideo');
    display.srcObject = localMediaStream;
    //display.setAttribute('muted', true);

    // add visualizer here for local audio:
    localAudioSource = audioCtx.createMediaStreamSource(localMediaStream);
    localAudioSource.connect(analyser);

    audioCtx.resume();
    audioCtx.onstatechange = () => console.log(audioCtx.state);
    draw();

    console.log(localAudioSource);

    $('#btn_start').disabled = true;

}


async function showCameraInfo() 
{
    let infoEl = $('#camera-info');
    const audioTrack = localMediaStream.getAudioTracks()[0];
    const videoTrack = localMediaStream.getVideoTracks()[0];

    infoEl.innerHTML = `input video: ${videoTrack.label} | audio: ${audioTrack.label}`
}


// Oscilliscope

let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
var bufferLength = analyser.frequencyBinCount;
var dataArray = new Uint8Array(bufferLength);
analyser.getByteTimeDomainData(dataArray);
let localAudioSource;

var canvas = document.getElementById("oscilloscope");
var canvasCtx = canvas.getContext("2d");

function draw() 
{
    requestAnimationFrame(draw);

    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = "rgb(255, 255, 255)";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgb(0, 0, 0)";

    canvasCtx.beginPath();

    var sliceWidth = canvas.width * 1.0 / bufferLength;
    var x = 0;

    for (var i = 0; i < bufferLength; i++) {

        var v = dataArray[i] / 128.0;
        var y = v * canvas.height / 2;

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

function sendDrawsocketMessage()
{
    console.log("sendDrawsocketMessage");

    let inputText = $('#drawsocket_output_text').value;
    console.log(inputText);

    try 
    {
        let json_ = JSON.parse(inputText);
        json_.timetag = Date.now();
        socket.emit('room-message',
            json_        
        );

        drawsocket.input(json_);
    }
    catch (err) 
    {
        console.log('failled to parse', err);
    }
   
    $('#message_panel').style.display = "none";

}


function createMessagePanel()
{
    $('#message_panel').style.display = "inline-block";
}

function keyHandler(e) {
    var TABKEY = 9;
    if(e.keyCode == TABKEY) {
        this.value += "\t";
        if(e.preventDefault) {
            e.preventDefault();
        }
        return false;
    }
}

window.addEventListener('load', () => {
    $('#btn_connect').addEventListener('click', soupclient.joinRoom );
    $('#btn_start').addEventListener('click', startStream);
    
    $('#input_sendfile').addEventListener('change', handleFiles, false);

    $('#btn_sendfile').addEventListener('click',()=> { 
        $('#input_sendfile').click() 
    });

    $('#btn_drawsocket').addEventListener('click', createMessagePanel );
    $('#btn_drawsocket_send').addEventListener('click', sendDrawsocketMessage );

    let textinput = $('#drawsocket_output_text');
    textinput.addEventListener('keydown', keyHandler, false );
    textinput.value = `{ 
        "key" : "tween", 
        "val" : [{ 
            "id" : "score-anim", 
            "cmd" : "play" 
        }, { 
           "id" : "miniscore-anim", 
           "cmd" : "play" 
        }]
    }`;

    window.addEventListener('unload', soupclient.leaveRoom);
})
