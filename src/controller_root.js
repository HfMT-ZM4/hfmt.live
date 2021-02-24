/**
 * to do:
 * add html and js options for file input
 *  in these cases, add the files to the menu
 *  I guess really everything should be in one file? not sure yet
 */
import * as soupclient from './soupclient-module';
import io from 'socket.io-client';
import * as drawsocket from './drawsocket-web';

(function(){

    let oscprefix = window.location.pathname; // document.getElementById("OSC").getAttribute("OSCprefix");
    if (oscprefix.includes('.html')) {
        oscprefix = oscprefix.slice(0, oscprefix.indexOf('.html'));
    }

    console.log('loading with namespace', oscprefix);

    if( oscprefix === '/' )
    {
        // redirect to instructions page
        window.location.replace("https://hfmt.live/start.html");
    }


    let url_args = new URLSearchParams(window.location.search);      
    let usr_id = url_args.get('id');  
    if( usr_id )
        console.log( `socket with custom usr arg ${usr_id}, args ${url_args}`);


    const socket = io(oscprefix, { 
        query: {    
            userId: usr_id
        }
    });
    //const socket = io();

    soupclient.init(socket);
    drawsocket.init(socket);

    let localMediaStream;

    window.drawsocket = drawsocket;
    window.drawsocket.getMediaStreams = function(){ return soupclient.getStreams() };

    window.drawsocket.sendStream = async function(stream, kind) {
        localMediaStream = stream;
        soupclient.sendStream(stream, kind);
        return 0;
    }

    //console.log('set the stream?', window.drawsocket.getMediaStreams);

    window.drawsocket.on_newPeerStream = async function(stream, kind, id) {
        return 0;
    }

    window.drawsocket.on_newLocalStream = async function(stream) {
        return 0;
    }

    window.drawsocket.on_removedPeerStream = async function(id) {
        return 0;
    }

    window.drawsocket.pauseVideoSend = soupclient.pauseVideoSend;
    window.drawsocket.resumeVideoSend = soupclient.resumeVideoSend;

    window.drawsocket.pauseAudioSend = soupclient.pauseAudioSend;
    window.drawsocket.resumeAudioSend = soupclient.resumeAudioSend;

    window.drawsocket.leaveRoom = soupclient.leaveRoom;

    const hostname = window.location.hostname;
    const $ = document.querySelector.bind(document);


    socket.on('room-message', (data) => {
        //console.log(data)
        if( data.hasOwnProperty('file') )
        {
        //  console.log(data.file);
            
            for(let i = 0; i < data.file.length; i++)
            {

                let file = data.file[i];
                let str = arrayBufferToString(file.buf);
                if( file.type === "application/json" )
                {
                    const json_ = JSON.parse( str );
                    processFile( file.name, json_ , 'drawsocket');
                }
                else
                {
                    processFile( file.name, str , file.type );
                }

            }
        }
        else if( typeof data.id != "undefined" )
        {
            if( data.id == usr_id )
            {
                drawsocket.input(data);
            }
        }
        else
        {
            drawsocket.input(data);
        }

        if( typeof window.max != "undefined" )
        {
            window.max.outlet("messageIn", JSON.stringify(data));
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

    async function loadScript(script, src){
        return new Promise((resolve, reject) => {
            script.onload = ()=> {
                document.head.removeChild(script);
                resolve()
            };
            script.onerror = reject;
            script.src = src
            document.head.appendChild(script);
        })
    }

    async function insertHTML(html, dest, append=false){
        // if no append is requested, clear the target element
        if(!append) 
            dest.innerHTML = '';

        // create a temporary container and insert provided HTML code
        let container = document.createElement('div');
        container.innerHTML = html;

        // cache a reference to all the scripts in the container
        let scripts = container.querySelectorAll('script');

        // get all child elements and clone them in the target element
        let nodes = container.childNodes;
        for( let i=0; i< nodes.length; i++) 
            dest.appendChild( nodes[i].cloneNode(true) );

        // force the found scripts to execute...
        for( let i=0; i< scripts.length; i++)
        {
            let script = document.createElement('script');
            script.type = scripts[i].type || 'text/javascript';

            if( scripts[i].hasAttribute('src') ) 
            {
                console.log('loading src', i);
                await loadScript(script, scripts[i].src);
                console.log('returned');

                //script.src = scripts[i].src;
            }
            else
            {
                console.log('loading script', i);

                script.innerHTML = scripts[i].innerHTML;

                document.head.appendChild(script);

                document.head.removeChild(script);
            }
                
                

        }
        // done!
        return true;
    }

    function processFile(name, obj, type)
    {
    // let obj = fileToObj(file);
    //    console.log(`received json ${JSON.stringify(obj, null, 2)}`);
        
        let menu = $('#select_part');
        menu.innerHTML = "";

        let el1 = document.createElement('option');
        el1.value = "";
        el1.innerHTML = "-- Select Display --";
        menu.appendChild(el1);

        if( type == 'drawsocket')
        {
            Object.keys(obj).forEach( key => {
                let el = document.createElement('option');
                el.value = key;
                el.innerHTML = `${name}: ${key}`;
                menu.appendChild(el);
            });

            menu.addEventListener('change', (event) => { 
                drawsocket.input( obj[event.target.value] );
            });
        }
        else
        {
            let el = document.createElement('option');
            el.value = name;
            el.innerHTML = name;
            menu.appendChild(el);

            drawsocket.input({
                key: "clear",
                val: "*"
            });

            menu.addEventListener('change', (event) => {            
                if( type == 'text/html')
                {               
                    insertHTML(obj, $('#forms') );
                }
                else if( type == 'text/js' )
                {
                    // ?
                }
            });
        }
        
    }


    async function handleFiles()
    {
        const file = this.files[0];
        console.log(this.files, this.files.length);


        let fileArray = [];
        for( let i = 0; i < this.files.length; i++)
        {
            let file = this.files[i];
            console.log(file);
        /*

            socket.emit('room-message', {
                file: file
            });
            */

        let reader = new FileReader();
        reader.readAsText(file);

            reader.onload = function() {
                if( file.type === "application/json" )
                {
                    processFile( file.name, JSON.parse(reader.result), 'drawsocket' );
                }
                else
                {
                    processFile( file.name, reader.result, file.type );
                }
                
            }
            
            reader.onerror = function() {
                console.log(reader.error);
            };

            fileArray.push({
                type: file.type,
                name: file.name,
                buf: file
            });
        }

        socket.emit('room-message', {
            file: fileArray
        });
        

    }


    soupclient.on_joinedRoom = ()=>{
        let btn = $('#btn_connect') ;
        if( btn )
            btn.disabled = true;
    }

    soupclient.on_newPeerStream = async (stream, kind, id) => {

        
    //    if( drawsocket.on_newPeerStream )
        {
            const ret = await window.drawsocket.on_newPeerStream(stream, kind, id);
            if( ret == 1 )
            {
                return;
            }

        }
        
        console.log('default on_newPeerStream id', kind, id);

        const peerId = id.lastIndexOf('#') < 0 ? id : id.substr(id.lastIndexOf('#')+1);

        const tag = kind + '-' + peerId;// id.substr(id.lastIndexOf('#')+1);;
        console.log('test tag', tag);

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


    soupclient.on_removedPeerStream = async (_id) => {


        const ret = await window.drawsocket.on_removedPeerStream(_id);
        if( ret == 1 )
        {
            return;
        }

        console.log("removing id", _id);

        if( _id.lastIndexOf('#') != -1 )
        {
            _id = _id.substr(_id.lastIndexOf('#')+1);
        }

        document.querySelectorAll(`#video-${_id}`).forEach(e => {
            e.parentNode.removeChild(e);
        });

        document.querySelectorAll(`#audio-${_id}`).forEach(e => {
            e.parentNode.removeChild(e);
        });
    }

    // to do: set audio and video stream devices
/*
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


        const ret = await window.drawsocket.on_newLocalStream(localMediaStream);
        if( ret != 1 )
        {
            defaultDisplay();
        }

        // default display when 
    }
*/
    window.drawsocket.startStream = deviceSelectionWindow;
    window.drawsocket.joinRoom = soupclient.joinRoom;

    async function defaultDisplay()
    {

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

    window.drawsocket.defaultDisplay = defaultDisplay;

    async function showCameraInfo() 
    {
        let infoEl = $('#camera-info');
        const audioTrack = localMediaStream.getAudioTracks()[0];
        const videoTrack = localMediaStream.getVideoTracks()[0];

        infoEl.innerHTML = `input video: ${videoTrack.label} | audio: ${audioTrack.label}`
    }


    // Oscilliscope
    // all the default display should be moved out of the controller module

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

    function checkURLArgs() 
    {
        let url_args = new URLSearchParams(window.location.search.substr(1));
        if(url_args)
        {
            console.log(Array.from(url_args.keys()).length);
        }

        // if we have no URL arguments, then we can go forward with websockets,
        // otherwise, don't make a socket, but prepare the read message for the json file fetch
        if( url_args.has("get") ) 
        {
        
        let _val = {
            fetch: url_args.get("get")
        };
    
        if (url_args.has("prefix")) 
        {
            _val.prefix = url_args.get("prefix");

            console.log({
                key: "file",
                val: _val
            });
        
            drawsocket.input({
                key: "file",
                val: _val
            });
        
        }
        else
        {
            const _filetype = _val.fetch.endsWith('json') ? 'json' : (_val.fetch.endsWith('html') ? 'html' : null);

            fetch(_val.fetch).then(function (response) {
                try {
                    console.log(response);
                    if ( _filetype == 'json' ) {
                        return response.json()
                    }
                    else if ( _filetype == 'html') {
                        return response.text();
                    }

                }
                catch (err) {
                    console.log('caught error:', err);
                }

                return;
            }).then(function (_fileContent) {

                if( _filetype == 'json' ){
                    processFile(name, _fileContent, 'drawsocket');
                }
                else if( _filetype == 'html' )
                {
                    insertHTML(_fileContent, $('#forms') );
                }

            }).catch(err =>
                console.error(`fetch error ${err}`)
            );

        }
        
        }
    }

    function setupMax()
    {
        if( typeof window.max !== "undefined" )
        {
            window.max.bindInlet('drawsocket', function (a) {
                try {
                    const obj = JSON.parse(a);
                    drawsocket.input(obj);
                    window.max.outlet("received", a);
                }
                catch(err)
                {
                    window.max.outlet("error", JSON.stringify(err));
                }
            });

            window.max.bindInlet('broadcast', function (a) {
                try {
                    const obj = JSON.parse(a);
                    obj.timetag = Date.now();
                    socket.emit('room-message',
                        obj        
                    );

                }
                catch(err)
                {
                    window.max.outlet("error", JSON.stringify(err));
                }
            });

            window.max.bindInlet('route', function (a) {
                try {
                    const obj = JSON.parse(a);
                    let delegate = {};

                    Object.keys(obj).forEach( key => {
                        if( key == usr_id || key == "*" )
                        {
                            let subObj = obj[key];
                            subObj.timetag = Date.now();

                            drawsocket.input({
                                subObj
                            })
                        }
                        else
                        {
                            delegate[key] = obj[key];
                            delegate[key].timetag = Date.now();
                        }
                    })

                    // match this ID or * and broadcast any other messages
                    if( Object.keys(delegate).length > 0 ){
                        socket.emit('room-message',
                            delegate        
                        );
                    }
                }
                catch(err)
                {
                    window.max.outlet("error", JSON.stringify(err));
                }
        }

    }


    function outToMax(obj)
    {
        if( typeof window.max !== "undefined" )
        {
            window.max.outlet("test", JSON.stringify(obj) );
        }
    }


    let audioInDevcies = {};
    let videoInDevices = {};

    let selectedAudioID = "default";
    let selectedVideoID = "default";

    async function getDevices () {

        let mediaStream = null;

        try {

            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            let devices = await navigator.mediaDevices.enumerateDevices();

            devices.forEach(function(device) {

                if( device.kind == "audioinput" )
                {
                    audioInDevcies[device.label] = device.deviceId;
                    console.log(device.kind + ": " + device.label +
                                " id = " + device.deviceId);
                }
                else if(device.kind == "videoinput" )
                {
                    videoInDevices[device.label] = device.deviceId;
                    console.log(device.kind + ": " + device.label +
                                " id = " + device.deviceId);

                }
                    //console.log(device.kind + ": " + device.label +" id = " + device.deviceId);
            });
            
        }
        catch (e) {
            console.error('start media streams error', e);
            return;
        }

        console.log(mediaStream);
    }

    /**
     * open start stream modal window
     */
    async function deviceSelectionWindow () {

        await getDevices();

        const makeMenu = function(selector, obj, value_callback)
        {
            let menu = document.querySelector(selector);
            menu.innerHTML = "";

            Object.keys(obj).forEach( key => {
                let el = document.createElement('option');
                el.value = key;
                el.innerHTML = `${name}: ${key}`;
                menu.appendChild(el);
            });

            menu.addEventListener('change', (event) => { 
                value_callback( obj[event.target.value] );
            });
        }


        makeMenu("#sel_video", videoInDevices, (val) => {
            console.log('set video to ', val);
            selectedVideoID = val;
        });

        makeMenu("#sel_audio", audioInDevcies, (val) => {
            console.log('set audio to ', val);
            selectedAudioID = val;
        });

        let div = document.getElementById("device_selection");

       // document.body.appendChild(div);
        div.style.display = "block";

    }

    /**
     * called from device selection modal window
     */
    async function startSelectedStream()
    {
        if( localMediaStream ){
            localMediaStream = null;
        }

        try {
            localMediaStream = await navigator.mediaDevices.getUserMedia({
                video: selectedVideoID == "default" ? true : { deviceId: selectedVideoID },
                audio: selectedAudioID == "default" ? true : { deviceId: selectedAudioID }
            });

        }
        catch (e) {
            console.error('start camera error', e);
        }

        await soupclient.sendStream(localMediaStream);


        const ret = await window.drawsocket.on_newLocalStream(localMediaStream);
        if( ret != 1 )
        {
            defaultDisplay();
        }
        
        document.getElementById("device_selection").style.display = "none";
    }

    
    window.addEventListener('load', () => {

       // outToMax({ hi: "hello!" });


        $('#btn_connect').addEventListener('click', soupclient.joinRoom );
       // $('#btn_start').addEventListener('click', startStream); // << this should maybe be in the soupclient...
        
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

        checkURLArgs();



        // setup modal device selection

        var modal = document.getElementById("device_selection");
        
        var span = document.getElementsByClassName("close")[0];
        span.onclick = function() {
            modal.style.display = "none";
        }

        // When the user clicks anywhere outside of the modal, close it
        window.onclick = function(event) {
            if (event.target == modal) {
                modal.style.display = "none";
            }
        }
        
        /**
         * this shoudl be the main start streams function
         */
        document.getElementById('btn_start').onclick = deviceSelectionWindow; 
        /*async () => {

            await getDevices();

            const makeMenu = function(selector, obj, value_callback)
            {
                let menu = document.querySelector(selector);
                menu.innerHTML = "";

                Object.keys(obj).forEach( key => {
                    let el = document.createElement('option');
                    el.value = key;
                    el.innerHTML = `${name}: ${key}`;
                    menu.appendChild(el);
                });

                menu.addEventListener('change', (event) => { 
                    value_callback( obj[event.target.value] );
                });
            }


            makeMenu("#sel_video", videoInDevices, (val) => {
                console.log('set video to ', val);
                selectedVideoID = val;
            });

            makeMenu("#sel_audio", audioInDevcies, (val) => {
                console.log('set audio to ', val);
                selectedAudioID = val;
            });

            document.getElementById("device_selection").style.display = "block";

        }
        */

        let startBtn = document.getElementById('start_stream');
        startBtn.onclick = startSelectedStream;
        /*
        async () => {
            if( localMediaStream ){
                localMediaStream = null;
            }

            try {
                localMediaStream = await navigator.mediaDevices.getUserMedia({
                    video: selectedVideoID == "default" ? true : { deviceId: selectedVideoID },
                    audio: selectedAudioID == "default" ? true : { deviceId: selectedAudioID }
                });

            }
            catch (e) {
                console.error('start camera error', e);
            }

            await soupclient.sendStream(localMediaStream);


            const ret = await window.drawsocket.on_newLocalStream(localMediaStream);
            if( ret != 1 )
            {
                defaultDisplay();
            }
            
            modal.style.display = "none";
        }
        */

       setupMax();


    })

})();
