// const fs = require( 'fs' );
// const OSC = require('osc-js');

// let settings = JSON.parse(fs.readFileSync(__dirname +"/settings.json", "utf8"));

// function openOSC(){
//   osc = new OSC({ plugin: new OSC.DatagramPlugin({
//     send:{
//       host: settings.host,
//       port: settings.port,
//     }
//   }) });
//   osc.open();
// }

// openOSC()

let stats = new Stats();
document.body.appendChild( stats.dom );


let params = {
  draw: {
    segmentationMask: true
  },
  source: {
    video: 'facetime',
    audio: 'default'
  }
}

let gui = new dat.GUI();

let folderDraw = gui.addFolder( 'Draw' );
folderDraw.add( params.draw, 'segmentationMask' )

let folderSrc = gui.addFolder( 'Source' );
folderSrc.add( params.source, 'video', { facetime: 'facetime', defaults: 'default' } );
folderSrc.add( params.source, 'audio' );

// import './node_modules/osc-js/lib/osc.min.js';

//     function openOSC(){
//   osc = new OSC({ plugin: new OSC.DatagramPlugin({
//     send:{
//       host: 'localhost',
//       port: '4060',
//     }
//   }) });
//   osc.open();
// }

// openOSC()

// const message = new OSC.Message('/test/path', 521.25, 'teststring', 665);
// osc.send(message);

// var testVideo = document.getElementsByClassName('test_video')[0];
const videoElement = document.getElementsByClassName( 'input_video' )[ 0 ];
var audioSelect = document.querySelector( 'select#audioSource' );
var videoSelect = document.querySelector( 'select#videoSource' );

const infoElement = document.getElementsByClassName( 'info' )[ 0 ];

audioSelect.onchange = getStream;
videoSelect.onchange = getStream;

getStream().then( getDevices ).then( gotDevices );

function getDevices() {
  // AFAICT in Safari this only gets default devices until gUM is called :/
  return navigator.mediaDevices.enumerateDevices();
}

function gotDevices( deviceInfos ) {
  window.deviceInfos = deviceInfos; // make available to console
  console.log( 'Available input and output devices:', deviceInfos );
  for ( const deviceInfo of deviceInfos ) {
    const option = document.createElement( 'option' );
    option.value = deviceInfo.deviceId;
    if ( deviceInfo.kind === 'audioinput' ) {
      option.text = deviceInfo.label || `Microphone ${audioSelect.length + 1}`;
      audioSelect.appendChild( option );
    } else if ( deviceInfo.kind === 'videoinput' ) {
      option.text = deviceInfo.label || `Camera ${videoSelect.length + 1}`;
      videoSelect.appendChild( option );
    }
  }
}

function getStream() {
  if ( window.stream ) {
    window.stream.getTracks().forEach( track => {
      track.stop();
    } );
  }
  const audioSource = audioSelect.value;
  const videoSource = videoSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    video: { deviceId: videoSource ? { exact: videoSource } : undefined }
  };
  return navigator.mediaDevices.getUserMedia( constraints ).
    then( gotStream ).catch( handleError );
}

function gotStream( stream ) {
  window.stream = stream; // make stream available to console
  audioSelect.selectedIndex = [ ...audioSelect.options ].
    findIndex( option => option.text === stream.getAudioTracks()[ 0 ].label );
  videoSelect.selectedIndex = [ ...videoSelect.options ].
    findIndex( option => option.text === stream.getVideoTracks()[ 0 ].label );
  videoElement.srcObject = stream;
}

function handleError( error ) {
  console.error( 'Error: ', error );
}

const canvasElement = document.getElementsByClassName( 'output_canvas' )[ 0 ];
const canvasCtx = canvasElement.getContext( '2d' );

canvasCtx.canvas.width = window.innerWidth;
canvasCtx.canvas.height = 3 * window.innerWidth / 4;

const landmarkContainer = document.getElementsByClassName( 'landmark-grid-container' )[ 0 ];
// const grid = new LandmarkGrid(landmarkContainer);


// function hasGetUserMedia() {
//   return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
// }
// if (hasGetUserMedia()) {
//   // Good to go!
//   console.log( 'we have get user media ');
//   const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true})
//   console.log( stream );

//   const devices = await navigator.mediaDevices.enumerateDevices();
//   console.log( devices );

//   const videoInputs = [];
//   devices.forEach( (device) => { if (device.kind == "videoinput") videoInputs.push( device ) } );
//   console.log( videoInputs );

//   // for ( let input of videoInputs ) {
//   //   if ( input.label == "FaceTime HD Camera (Built-in) (05ac:8510)" )
//   //     stream.id = input.id;
//   // }



// } else {`
//   alert("getUserMedia() is not supported by your browser");
// }
let timer = Date.now();


function onResults( results ) {

  stats.begin();

  // if (!results.poseLandmarks) {
  //   grid.updateLandmarks([]);
  //   return;
  // }

  canvasCtx.save();
  canvasCtx.clearRect( 0, 0, canvasElement.width, canvasElement.height );

  if ( params.draw.segmentationMask ) {
    canvasCtx.drawImage( results.segmentationMask, 0, 0,
      canvasElement.width, canvasElement.height );
  }

  // Only overwrite existing pixels.
  canvasCtx.globalCompositeOperation = 'source-in';
  canvasCtx.fillStyle = '#00FF00';
  canvasCtx.fillRect( 0, 0, canvasElement.width, canvasElement.height );

  // Only overwrite missing pixels.
  canvasCtx.globalCompositeOperation = 'destination-atop';
  canvasCtx.drawImage(
    results.image, 0, 0, canvasElement.width, canvasElement.height );

  canvasCtx.globalCompositeOperation = 'source-over';
  drawConnectors( canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
    { color: '#00FF00', lineWidth: 4 } );
  drawLandmarks( canvasCtx, results.poseLandmarks,
    { color: '#FF0000', lineWidth: 2 } );
  canvasCtx.restore();


  // if (osc.status() === OSC.STATUS.IS_OPEN) {

  //   osc.send( 'test', JSON.stringify( results.landmarks ) );
  // }


  // grid.updateLandmarks(results.poseWorldLandmarks);

  if ( Date.now() - timer > 5000 ) {
    timer = Date.now();
    console.log( results.poseLandmarks );
  }

  stats.end();
}

const pose = new Pose( {
  locateFile: ( file ) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  }
} );
pose.setOptions( {
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: true,
  smoothSegmentation: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
} );
pose.onResults( onResults );



const camera = new Camera( videoElement, {
  onFrame: async () => {
    await pose.send( { image: videoElement } );
  },
  width: 720,
  height: 480
} );
camera.start();

function sendPosesADDR( poses ) {
  osc.send( new OSC.Message( '/videoWidth', camera.videoWidth ) );
  osc.send( new OSC.Message( '/videoHeight', camera.videoHeight ) );
  osc.send( new OSC.Message( '/nPoses', poses.length ) );
  for ( var i = 0; i < poses.length; i++ ) {
    osc.send( new OSC.Message( '/poses/' + i + "/score", poses[ i ].score ) )
    for ( var j = 0; j < poses[ i ].keypoints.length; j++ ) {
      var kpt = poses[ i ].keypoints[ j ];
      var pth = '/poses/' + i + "/keypoints/" + kpt.part + "/";
      osc.send( new OSC.Message( pth + "x", kpt.position.x ) );
      osc.send( new OSC.Message( pth + "y", kpt.position.y ) );
      osc.send( new OSC.Message( pth + "score", kpt.score ) );
    }
  }
}