const fs = require( 'fs' );
const { ipcRenderer } = require( 'electron' );
const Pose = require( '@mediapipe/pose/pose.js' )
const OSC = require( 'osc-js' );
const dat = require( 'dat.gui' );
const Stats = require( 'stats.js' );
const { Camera } = require( '@mediapipe/camera_utils' );
const drawUtils = require( '@mediapipe/drawing_utils/drawing_utils.js' );

//const mediaStream = require('media-stream-library');
//const MjpegCamera = require('mjpeg-camera');
const { pipelines, isRtcpBye } = window.mediaStreamLibrary

const model = {};

let frameInProcess =  false;

init();
loop();


function init() {

  // Settings

  model.settings = JSON.parse( fs.readFileSync( __dirname + "/settings.json", "utf8" ) );

  model.params = {
    global: {
      showStats: true,
    },
    input: {
      source: '',
      mirror: false,
      rotate: 0,
      availableSources: {
        video: {},
        audio: {}
      }
    },
    pose: {
      options: {
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: true,
        smoothSegmentation: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      }
    },
    draw: {
      landmarks: true,
      segmentationMask: false,
      landmarkSize: 4,
      connectorSize: 4,
    },
    osc: {
      enable: true,
      send_format: 'sendPosesJSON',
      host: 'localhost',
      port: '9527',
      msgsPerSecond: 30,
    },
    debug: {
      drawFirstImage: true,
      sendToPose: true,
      poseSource: 'canvas',
    }
  }

  // HTML

  model.html = {};

  model.html.videoElement = document.getElementById( 'input_video' );
  
  model.html.videoCanvasElement = document.getElementById( 'input_video_canvas' );
  model.html.videoCanvasCtx = model.html.videoCanvasElement.getContext( '2d' );
  
  model.html.canvasElement = document.getElementById( 'output_canvas' );
  model.html.canvasCtx = model.html.canvasElement.getContext( '2d' );
  
  model.html.canvasBuffer = document.getElementById('BufferCanvas');
  model.html.canvasBufferCtx = model.html.canvasBuffer.getContext('2d');
  
  model.html.videoElement.onloadeddata = function () {

    let scale = 0.1

    const w = model.html.videoElement.videoWidth;
    const h = model.html.videoElement.videoHeight;

    console.log( "camera dimensions", w, h );

    model.html.videoCanvasCtx.canvas.width = w;
    model.html.videoCanvasCtx.canvas.height = h;
    model.html.canvasCtx.canvas.width = w;
    model.html.canvasCtx.canvas.height = h;


    model.html.canvasBufferCtx.canvas.width = w * scale;
    model.html.canvasBufferCtx.canvas.height = h * scale;

    ipcRenderer.send( 'resize', document.body.innerWidth, document.body.innerHeight ); //w, h);

  }

  document.body.addEventListener( "keypress", onKeyPress );

  // OSC

  model.osc = openOSC( model.params.osc.host, model.params.osc.port );
  model.oscTimer = Date.now();

  model.keypointNames = [
    'nose',
    'left_eye_inner', 'left_eye', 'left_eye_outer',
    'right_eye_inner', 'right_eye', 'right_eye_outer',
    'left_ear', 'right_ear',
    'mouth_left', 'mouth-right',
    'left_shoulder', 'right_shoulder',
    'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist',
    'left_pinky', 'right_pinky',
    'left_index', 'right_index',
    'left_thumb', 'right_thumb',
    'left_hip', 'right_hip',
    'left_knee', 'right_knee',
    'left_ankle', 'right_ankle',
    'left_heel', 'right_heel',
    'left_foot_index', 'right_foot_index'
  ]

  // Audio playback to ensure camera keeps rendering even when window is not in focus
  generateAudioElement( `${__dirname}/silent.mp3` );

  // GUI
  // (async () => {
  //   await getStream( model.params.input.source, model.html.videoElement );
  //   await getDevices( model.params.input.availableSources.video );
    generateGUI( model.params );
  // })()

  // Stats

  model.stats = new Stats();
  model.stats.showPanel( 0 );
  document.body.appendChild( model.stats.dom );

  // BlazePose

  model.pose = new Pose.Pose( {
    locateFile: ( file ) => {
      return `${__dirname}/node_modules/@mediapipe/pose/${file}`;
    }
  } );

  model.pose.setOptions( model.params.pose.options );
  model.pose.onResults( onResults );

  // Camera  
  const authorize= async ( host = '192.168.0.200' ) => {
    // Force a login by fetching usergroup
    const fetchOptions = {
      credentials: 'include',
      headers: {
        'Axis-Orig-Sw': true,
        'X-Requested-With': 'XMLHttpRequest',
      },
      mode: 'no-cors',
    }
    try {
      await window.fetch( `http://${host}/axis-cgi/usergroup.cgi`, fetchOptions )
    } catch ( err ) {
      console.error( err )
    }
  }

  const play = ( host = '192.168.0.200', encoding = 'h264' ) => {

    let mediaElement = model.html.videoElement;

    // Setup a new pipeline
    // const pipeline = new pipelines.Html5VideoPipeline( {
    //   ws: { uri: `ws://${host}/rtsp-over-websocket` },
    //   rtsp: { uri: `rtsp://${host}/axis-media/media.amp?videocodec=${encoding}` },
    //   mediaElement,
    // } )

    pipeline = new pipelines.HttpMsePipeline({
      http: {
        uri: `http://${host}/axis-cgi/media.cgi?videocodec=h264&container=mp4`,
      },
      mediaElement,
    })
    pipeline.http.play()


    // // Restart stream on RTCP BYE (stream ended)
    // pipeline.rtsp.onRtcp = ( rtcp ) => {
    //   if ( isRtcpBye( rtcp ) ) {
    //     setTimeout( () => play( host, encoding ), 0 )
    //   }
    // }

    // pipeline.ready.then( () => {
    //   pipeline.rtsp.play()
    // } )

    return pipeline
  }

  let pipeline;

  async function startIpStream() {
    pipeline && pipeline.close()
    await authorize()
    pipeline = play()
  }

  startIpStream()

  // model.camera = new Camera( model.html.videoCanvasElement, {
  //   onFrame: onFrame,
  //   width: model.html.videoElement.videoWidth,
  //   height: model.html.videoElement.videoHeight
  // } );

  // model.camera.start();
}

// Loop

async function loop() {

  model.stats.begin();

  // Settings args because @mediapipe/camera_utils returns a specific to onFrame and can't take a function with custom ones.
  // Even though this args takes globals, it's here so refactoring to a pure function is easier in the future if we don't use @mediapipe/camera_utils.
  const args = {
    video: model.html.videoElement,
    canvas: model.html.videoCanvasElement,
    context: model.html.videoCanvasCtx,
    pose: model.pose
  }

  if ( model.params.debug.drawFirstImage ) args.context.drawImage( args.video, 0, 0, args.canvas.width, args.canvas.height )

  // if ( model.params.input.rotate != 0 ) {

  //   // if ( model.params.input.rotate % 180 == 0 ) {
  //   //   args.canvas.width = args.video.width;
  //   //   args.canvas.height = args.video.height;
  //   // } else {
  //   //   args.canvas.width = args.video.height;
  //   //   args.canvas.height = args.video.width;
  //   // }

  //   rotate(
  //     args.canvas,
  //     args.canvas,
  //     args.context,
  //     model.params.input.rotate
  //   )
  // }

  // if ( !!model.params.input.mirror ) {
  //   mirror(
  //     args.canvas,
  //     args.canvas,
  //     args.context
  //   );
  // }

  // Send output element frame to BlazePose.

  //if(frameInProcess) return

  if (model.params.debug.sendToPose && !frameInProcess) {
    frameInProcess = true
    args.pose.send( { image: args[ model.params.debug.poseSource ] });
  } 
  
  //console.log("frame in progress: ", frameInProcess);

  model.stats.end();

  requestAnimationFrame( loop );

  function rotate( inE, outE, outCtx, angle ) {

    const w = inE.width;
    const h = inE.height;

    const x = outE.width * 0.5;
    const y = outE.height * 0.5;

    const angleInRadians = angle * ( Math.PI / 180 );

    // Rotate magic
    outCtx.translate( x, y );
    outCtx.rotate( angleInRadians );

    // Draw video frame to output canvas context
    outCtx.drawImage( inE, - ( w * 0.5 ), - ( h * 0.5 ), w, h );

    // Revert global changes to context
    outCtx.rotate( -angleInRadians );
    outCtx.translate( -x, -y );

  }

  function mirror( inE, outE, outCtx ) {

    let w = outE.width;
    let h = outE.height;

    // Mirror magic
    outCtx.scale( -1, 1 );
    w = -w;

    // Draw video frame to output canvas context
    outCtx.drawImage( inE, 0, 0, w, h )

    // Revert global changes to context
    outCtx.scale( -1, 1 );

  }

}

// async function onFrame() {

//   // Settings args because @mediapipe/camera_utils returns a specific to onFrame and can't take a function with custom ones.
//   // Even though this args takes globals, it's here so refactoring to a pure function is easier in the future if we don't use @mediapipe/camera_utils.
//   const args = {
//     video: model.html.videoElement,
//     canvas: model.html.videoCanvasElement,
//     context: model.html.videoCanvasCtx,
//     pose: model.pose
//   }

//   args.context.drawImage( args.video, 0, 0, args.canvas.width, args.canvas.height )

//   if ( model.params.input.rotate != 0 ) {

//     // if ( model.params.input.rotate % 180 == 0 ) {
//     //   args.canvas.width = args.video.width;
//     //   args.canvas.height = args.video.height;
//     // } else {
//     //   args.canvas.width = args.video.height;
//     //   args.canvas.height = args.video.width;
//     // }

//     rotate(
//       args.canvas,
//       args.canvas,
//       args.context,
//       model.params.input.rotate
//     )
//   }

//   if ( !!model.params.input.mirror ) {
//     mirror(
//       args.canvas,
//       args.canvas,
//       args.context
//     );
//   }

//   // Send output element frame to BlazePose.
//   await args.pose.send( { image: args.canvas } );

//   function rotate( inE, outE, outCtx, angle ) {

//     const w = inE.width;
//     const h = inE.height;

//     const x = outE.width * 0.5;
//     const y = outE.height * 0.5;

//     const angleInRadians = angle * ( Math.PI / 180 );

//     // Rotate magic
//     outCtx.translate( x, y );
//     outCtx.rotate( angleInRadians );

//     // Draw video frame to output canvas context
//     outCtx.drawImage( inE, - ( w * 0.5 ), - ( h * 0.5 ), w, h );

//     // Revert global changes to context
//     outCtx.rotate( -angleInRadians );
//     outCtx.translate( -x, -y );

//   }

//   function mirror( inE, outE, outCtx ) {

//     let w = outE.width;
//     let h = outE.height;

//     // Mirror magic
//     outCtx.scale( -1, 1 );
//     w = -w;

//     // Draw video frame to output canvas context
//     outCtx.drawImage( inE, 0, 0, w, h )

//     // Revert global changes to context
//     outCtx.scale( -1, 1 );

//   }

// }

function onResults( results ) {
  
  // Clear rect first so the old landmarks are gone if new results are null.
  model.html.canvasCtx.clearRect( 0, 0, model.html.canvasElement.width, model.html.canvasElement.height );

  if ( results.poseLandmarks == null ) return;

  model.html.canvasCtx.save();

  if ( model.params.draw.segmentationMask ) {
    model.html.canvasCtx.drawImage( results.segmentationMask, 0, 0,
      model.html.canvasElement.width, model.html.canvasElement.height );
  }

  // Some code from example that draws a mask. Don't really understand what it's doing.

  // Only overwrite existing pixels.
  // model.html.canvasCtx.globalCompositeOperation = 'source-in';
  // model.html.canvasCtx.fillStyle = '#0000ff';
  // model.html.canvasCtx.fillRect( 0, 0, model.html.canvasElement.width, model.html.canvasElement.height );

  // // Only overwrite missing pixels.
  // model.html.canvasCtx.globalCompositeOperation = 'destination-atop';
  // model.html.canvasCtx.drawImage(
  //   results.image, 0, 0, model.html.canvasElement.width, model.html.canvasElement.height );

  // Draw connectors and landmarks

  if ( model.params.draw.landmarks ) {
    model.html.canvasCtx.globalCompositeOperation = 'source-over';
    drawUtils.drawConnectors( model.html.canvasCtx, results.poseLandmarks, Pose.POSE_CONNECTIONS,
      { color: '#aaff00', lineWidth: model.params.draw.connectorSize } );
    drawUtils.drawLandmarks( model.html.canvasCtx, results.poseLandmarks,
      { color: '#ff0000', lineWidth: model.params.draw.landmarkSize } );
  }

  model.html.canvasCtx.restore();

  // Send OSC messages in the message rate defined in model.params.
  if ( model.params.osc.enable && ( ( Date.now() - model.oscTimer ) > ( 1000 / model.params.osc.msgsPerSecond ) ) ) {

    // Send OSC through the function named as a string in model.params.
    window[ model.params.osc.send_format ]( results, model.osc );
    timer = Date.now();

  }

  frameInProcess = false;
  //console.log("frame in progress: " ,frameInProcess);
}

// Input

/**
 * Gets stream from source, sets it to element.
 * */
async function getStream( sourceId, element ) {
  if ( window.stream ) {
    window.stream.getTracks().forEach( track => {
      track.stop();
    } );
  }

  const constraints = {
    video: { deviceId: sourceId ? { exact: sourceId } : undefined }
  };

  try {

    const stream = await navigator.mediaDevices.getUserMedia( constraints );
    element.srcObject = stream;

  } catch ( err ) {

    console.error( err );
    alert( 'could not connect stream' );;

  }

  return false;

}

async function getDevices( sources ) {
  // AFAICT in Safari this only gets default devices until gUM is called :/
  const deviceInfos = await navigator.mediaDevices.enumerateDevices();

  for ( const deviceInfo of deviceInfos ) {
    if ( deviceInfo.kind === 'videoinput' ) {
      sources[ deviceInfo.label ] = deviceInfo.deviceId;
    }
  }

  return false;

}

// Generate

function generateGUI( params ) {

  let gui = new dat.GUI();

  let folderSrc = gui.addFolder( 'Input' );
  let inputSourceGUI = folderSrc.add( params.input, 'source', params.input.availableSources.video ).name( 'Input Source' ).onChange( ( source ) => getStream( source, model.html.videoElement ) ).listen();
  console.log( inputSourceGUI );
  folderSrc.add( params.input, 'mirror' );
  folderSrc.add( params.input, 'rotate', 0, 270 ).step( 90 );
  // folderSrc.add( params.input, 'audio' );

  let folderPose = gui.addFolder( 'Pose' );
  // { lite: 0, full: 1, heavy: 2 }
  folderPose.add( params.pose.options, 'modelComplexity', 0, 2 ).step( 1 ).onChange( () => model.pose.setOptions( params.pose.options ) );
  folderPose.add( params.pose.options, 'minDetectionConfidence', 0, 1 ).step( 0.01 ).onChange( () => model.pose.setOptions( params.pose.options ) );
  folderPose.add( params.pose.options, 'minTrackingConfidence', 0, 1 ).step( 0.01 ).onChange( () => model.pose.setOptions( params.pose.options ) );


  let folderDraw = gui.addFolder( 'Draw' );
  folderDraw.add( params.draw, 'segmentationMask' )
  folderDraw.add( params.draw, 'landmarkSize', 0, 10 ).step( 1 );
  folderDraw.add( params.draw, 'connectorSize', 0, 10 ).step( 1 );

  let folderOsc = gui.addFolder( 'OSC' );
  folderOsc.add( params.osc, 'enable' )
  folderOsc.add( params.osc, 'send_format', {
    ADDR: 'sendPosesADDR',
    JSON: 'sendPosesJSON',
    // ARR:  'sendPosesARR',
    // XML:  'sendPosesXML'
  } )
  folderOsc.add( params.osc, 'host' )
  folderOsc.add( params.osc, 'port' )
  folderOsc.add( params.osc, 'msgsPerSecond', 1, 60 ).step( 1 );

  let folderDebug = gui.addFolder( 'Debug' );
  folderDebug.add( params.debug, 'drawFirstImage' );
  folderDebug.add( params.debug, 'sendToPose' );
  folderDebug.add( params.debug, 'poseSource', { canvas: 'canvas', video: 'video' } );

}

/**
 * Generates an audio DOM element that autoplays an mp3.
 * By default, videos in browsers usually stop rendering when the window is out of focus.
 * This autoplayed audio circumvents that.
 */
function generateAudioElement( pathToAudioFile ) {

  let audio = document.createElement( "audio" );
  audio.controls = "controls";
  audio.loop = "loop";
  audio.autoplay = "autoplay";
  audio.volume = "0.001";
  audio.style.display = "none";
  let source = document.createElement( "source" );
  source.src = pathToAudioFile;
  audio.appendChild( source );
  document.body.appendChild( audio );

}

// Interaction
function onKeyPress( event ) {

  switch ( event.key ) {

    // C for console.log
    case 'c':
      console.log( {
        model: model,
        drawUtils, drawUtils,
        camera: model.camera,
        CameraImport: Camera,
        pose: model.pose
      } );
      break;

    case 'g':
      dat.GUI.toggleHide();
      params.global.showStats = !params.global.showStats;
      model.stats.dom.style.display = params.global.showStats ? "block" : "none";
      // logDOM.style.display = showStats ? "block" : "none";
      break;

    case 'r':
      window.open( './blazepose-recorder.html', target = "_self" );

    case 'x':
      ipcRenderer.send( 'float' );
      break;
  }
}

// OSC

/**
 * Generates and returns an OSC instance
 * */
function openOSC( host, port ) {
  let oscInstance = new OSC( {
    plugin: new OSC.DatagramPlugin( {
      send: {
        host: host,
        port: port,
      }
    } )
  } );
  oscInstance.open();
  return oscInstance;
}

/**
 * Sends input pose landmarks through osc instance.
 * 
 * @param {Array} poses Array of 33 landmarks organized in objects with x, y, z, and visibility properties - all normalized.
 */
function sendPosesADDR( poses, osc ) {

  osc.send( new OSC.Message( '/videoWidth', poses.image.width ) );
  osc.send( new OSC.Message( '/videoHeight', poses.image.height ) );
  //osc.send(new OSC.Message('/nPoses',poses.poseLandmarks.length));
  for ( var i = 0; i < poses.poseLandmarks.length; i++ ) {
    var kpt = poses.poseLandmarks[ i ];
    var pth = '/pose/keypoints/' + model.keypointNames[ i ] + "/";

    osc.send( new OSC.Message( pth + "x", kpt.x ) );
    osc.send( new OSC.Message( pth + "y", kpt.y ) );
    osc.send( new OSC.Message( pth + "z", kpt.z ) );
    osc.send( new OSC.Message( pth + "visibility", kpt.visibility ) );
  }

}

function sendPosesJSON( poses, osc ) {
  osc.send( new OSC.Message( "/poses/json", JSON.stringify( poses ) ) );
}

function sendPosesARR( poses, osc ) {
  var arr = [ "/poses/arr" ]
  arr.push( camera.videoWidth );
  arr.push( camera.videoHeight );
  arr.push( poses.length );
  for ( var i = 0; i < poses.length; i++ ) {
    arr.push( poses[ i ].score )
    for ( var j = 0; j < poses[ i ].keypoints.length; j++ ) {
      var kpt = poses[ i ].keypoints[ j ];
      arr.push( kpt.position.x );
      arr.push( kpt.position.y );
      arr.push( kpt.score );
    }
  }
  osc.send( new OSC.Message( ...arr ) );
}

function sendPosesXML( poses, osc ) {
  function rd( n ) {
    return Math.round( n * 100 ) / 100
  }
  var result = `<poses videoWidth="${camera.videoWidth}" videoHeight="${camera.videoHeight}" nPoses="${poses.length}">`;
  for ( var i = 0; i < poses.length; i++ ) {
    result += `<pose score="${rd( poses[ i ].score )}">`
    for ( var j = 0; j < poses[ i ].keypoints.length; j++ ) {
      var kpt = poses[ i ].keypoints[ j ];
      result += `<keypoint part="${kpt.part}" x="${rd( kpt.position.x )}" y="${rd( kpt.position.y )}" score="${rd( kpt.score )}"/>`
    }
    result += "</pose>"
  }
  result += `</poses>`

  osc.send( new OSC.Message( "/poses/xml", result ) );
}

