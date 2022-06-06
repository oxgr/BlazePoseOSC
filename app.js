const fs = require( 'fs' );
const { ipcRenderer } = require( 'electron' );
const Pose = require( '@mediapipe/pose/pose.js' )
const OSC = require( 'osc-js' );
const dat = require( 'dat.gui' );
const Stats = require( 'stats.js' );
const { Camera } = require( '@mediapipe/camera_utils' );
const drawUtils = require( '@mediapipe/drawing_utils/drawing_utils.js' )

let timer = Date.now();

const params = {
  global: {
    showStats: true,
  },
  input: {
    source: '',
    mirror: true,
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
    segmentationMask: false,
    landmarkSize: 4,
    connectorSize: 4,
  },
  osc: {
    enable: true,
    send_format: 'sendPosesJSON',
    host: 'localhost',
    port: '9527',
    frequency: 60,
  }
}

const keypointNames = [
  'nose',
  'left_eye_inner',   'left_eye',   'left_eye_outer',
  'right_eye_inner',  'right_eye',  'right_eye_outer',
  'left_ear',         'right_ear',
  'mouth_left',       'mouth-right',
  'left_shoulder',    'right_shoulder',
  'left_elbow',       'right_elbow',
  'left_wrist',       'right_wrist',
  'left_pinky',       'right_pinky',
  'left_index',       'right_index',
  'left_thumb',       'right_thumb',
  'left_hip',         'right_hip',
  'left_knee',        'right_knee',
  'left_ankle',       'right_ankle',
  'left_heel',        'right_heel',
  'left_foot_index',  'right_foot_index'
]

// Settings

let settings = JSON.parse( fs.readFileSync( __dirname + "/settings.json", "utf8" ) );

// OSC

let osc = openOSC( params.osc.host, params.osc.port );

// HTML

document.body.addEventListener( "keypress", onKeyPress )

const videoElement = document.getElementById( 'input_video' );
const videoCanvasElement = document.getElementById( 'input_video_canvas' );
const videoCanvasCtx = videoCanvasElement.getContext( '2d' );

const canvasElement = document.getElementById( 'output_canvas' );
const canvasCtx = canvasElement.getContext( '2d' );
// if ( params.input.mirror ) videoElement.style.scaleX = '-1';

//// Audio playback to ensure camera keeps rendering even when window is not in focus
generateAudioElement( `${__dirname}/silent.mp3` );

// GUI

getStream( params.input.source, videoElement )
.then( getDevices( params.input.availableSources.video ) )
.then( generateGUI( params ) );

// Stats

let stats = new Stats();
stats.showPanel( 0 );
document.body.appendChild( stats.dom );

// BlazePose

const pose = new Pose.Pose( {
  locateFile: ( file ) => {
    return `${__dirname}/node_modules/@mediapipe/pose/${file}`; ;
  }
} );

pose.setOptions( params.pose.options );
pose.onResults( onResults );

// Camera

var [ w, h ] = [ 0, 0 ];

videoElement.onloadeddata = function () {

  // if ( params.source.mirror ) videoElement.style.transform = 'rotateY( 180deg )';
  

  [ w, h ] = [ videoElement.videoWidth, videoElement.videoHeight ];

  console.log( "camera dimensions", w, h );

  videoCanvasCtx.canvas.width = w;
  videoCanvasCtx.canvas.height = h;
  canvasCtx.canvas.width = w;
  canvasCtx.canvas.height = h;

  ipcRenderer.send( 'resize', document.body.innerWidth, document.body.innerHeight ); //w, h);

}



const camera = new Camera( videoElement, {
  onFrame: async () => {
    videoCanvasCtx.clearRect( 0, 0, canvasElement.width, canvasElement.height );
    videoCanvasCtx.drawImage( videoElement, 100, 0, 0, 100 )
    await pose.send( { image: videoCanvasElement } );
  },
  width: w,
  height: h
} );

camera.start();

// Tests
  
// var net = undefined;
// var testImage = undefined;
// var testImageUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg/637px-Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg";
// var frameCount = 0;

function onResults( results ) {

  if ( results.poseLandmarks == null ) return;

  stats.begin();

  canvasCtx.save();
  canvasCtx.clearRect( 0, 0, canvasElement.width, canvasElement.height );

  if ( params.draw.segmentationMask ) {
    canvasCtx.drawImage( results.segmentationMask, 0, 0,
      canvasElement.width, canvasElement.height );
  }

  // Only overwrite existing pixels.
  // canvasCtx.globalCompositeOperation = 'source-in';
  // canvasCtx.fillStyle = '#0000ff';
  // canvasCtx.fillRect( 0, 0, canvasElement.width, canvasElement.height );

  // // Only overwrite missing pixels.
  // canvasCtx.globalCompositeOperation = 'destination-atop';
  // canvasCtx.drawImage(
  //   results.image, 0, 0, canvasElement.width, canvasElement.height );

  canvasCtx.globalCompositeOperation = 'source-over';
  drawUtils.drawConnectors( canvasCtx, results.poseLandmarks, Pose.POSE_CONNECTIONS,
    { color: '#aaff00', lineWidth: params.draw.connectorSize } );
  drawUtils.drawLandmarks( canvasCtx, results.poseLandmarks,
    { color: '#ff0000', lineWidth: params.draw.landmarkSize } );
  canvasCtx.restore();


  // Send OSC through the function named as a string in params.
  if ( params.osc.enable && ( ( Date.now() - timer ) > ( 1000 / params.osc.frequency ) ) ) {
    
    window[ params.osc.send_format ]( results );
    timer = Date.now();

  }



  // if (osc.status() === osc.STATUS.IS_OPEN) {
  //   osc.send( 'test', JSON.stringify( results.landmarks ) );
  // }

  // if ( Date.now() - timer > 5000) {
  //   timer = Date.now();
  //   console.log( results.poseLandmarks );
  // }

  stats.end();
}

// Gets stream from source, sets it to element.
async function getStream( sourceId, element ) {
  if (window.stream) {
    window.stream.getTracks().forEach(track => {
      track.stop();
    });
  }

  const constraints = {
    video: {deviceId: sourceId ? {exact: sourceId} : undefined}
  };

  try {

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    element.srcObject = stream;
    
  } catch ( err ) {

    console.error( err );
    alert( 'could not connect stream' );;

  }

}

async function getDevices( sources ) {
  // AFAICT in Safari this only gets default devices until gUM is called :/
  const deviceInfos = await navigator.mediaDevices.enumerateDevices();

  for (const deviceInfo of deviceInfos) {
    if (deviceInfo.kind === 'videoinput') {
      sources[ deviceInfo.label ] = deviceInfo.deviceId;
    }
  }
}

function generateGUI( params ) {

  let gui = new dat.GUI();

  let folderSrc = gui.addFolder( 'Input' );
  folderSrc.add( params.input, 'source', params.input.availableSources.video ).name( 'Input Source' ).onChange( ( source ) => getStream( source, videoElement) );
  folderSrc.add( params.input, 'mirror' ).onChange( ( val ) => videoElement.style.transform = val ? 'scale( -1, 1 )' : 'scale( 1, 1 )' )
  // folderSrc.add( params.input, 'audio' );

  let folderPose = gui.addFolder( 'Pose' );
  folderPose.add( params.pose.options, 'minDetectionConfidence', 0, 1 ).step( 0.01 ).onChange( () => pose.setOptions( params.pose.options ) )

  let folderDraw = gui.addFolder( 'Draw' );
  folderDraw.add( params.draw, 'segmentationMask' )
  folderDraw.add( params.draw, 'landmarkSize' , 0, 10 ).step( 1 );
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
  folderOsc.add( params.osc, 'frequency', 1, 60 ).step( 1 );

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

function onKeyPress ( event ) {

  switch ( event.key ) {
    
    // C for console.log
    case 'c':
      console.log( {
        videoElement: videoElement,
        drawUtils, drawUtils,
        camera: camera,
        CameraImport: Camera
      } );
      break;

    case 'g':
      dat.GUI.toggleHide();
      params.global.showStats = !params.global.showStats;
      stats.dom.style.display = params.global.showStats ? "block" : "none";
      // logDOM.style.display = showStats ? "block" : "none";
      break;
    
    case 'r':
      window.open( './blazepose-recorder.html', target="_self");
      
    case 'x':
      ipcRenderer.send( 'float' );
      break;
  }
}

/**
 * Generates and returns an OSC instance
 * */
function openOSC( host, port ) {
  let osc = new OSC( {
    plugin: new OSC.DatagramPlugin( {
      send: {
        host: host,
        port: port,
      }
    } )
  } );
  osc.open();
  return osc;
}

/**
 * Sends input pose landmarks through osc instance.
 * 
 * @param {Array} poses Array of 33 landmarks organized in objects with x, y, z, and visibility properties - all normalized.
 */
function sendPosesADDR( poses ) {
  osc.send( new OSC.Message( '/videoWidth', poses.image.width ) );
  osc.send( new OSC.Message( '/videoHeight', poses.image.height ) );
  //osc.send(new OSC.Message('/nPoses',poses.poseLandmarks.length));
  for ( var i = 0; i < poses.poseLandmarks.length; i++ ) {
    var kpt = poses.poseLandmarks[ i ];
    var pth = '/pose/keypoints/' + keypointNames[ i ] + "/";

    osc.send( new OSC.Message( pth + "x", kpt.x ) );
    osc.send( new OSC.Message( pth + "y", kpt.y ) );
    osc.send( new OSC.Message( pth + "z", kpt.z ) );
    osc.send( new OSC.Message( pth + "visibility", kpt.visibility ) );
  }

}

function sendPosesJSON( poses ) {
  osc.send( new OSC.Message( "/poses/json", JSON.stringify( poses ) ) );
}

function sendPosesARR( poses ) {
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

function sendPosesXML( poses ) {
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

