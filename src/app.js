/**
 * BlazePoseOSC by Faadhi Fauzi and Amir Rostami
 * 
 * Based on PoseOSC by Lingdong Huang
 * 
 * 
 * This is the main file of the app.
 * The code runs on a familiar setup/draw structure with init() running once and loop() at 60fps or maximum.
 * 
 * The model object houses all global variables as its properties.
 * 
 * Frame data is sent to the BlazePose model at the end of loop().
 * Results are processed in onResults().
 * 
 * Pressing G shows/hides the GUI and simultaneously saves the parameters to ./settings.json
 * 
 */

const fs = require( 'fs' );
const path = require( 'path' );
const { ipcRenderer, remote } = require( 'electron' );
const Pose = require( '@mediapipe/pose/pose.js' )
const OSC = require( 'osc-js' );
const dat = require( 'dat.gui' );
const Stats = require( 'stats.js' );
const { Camera } = require( '@mediapipe/camera_utils' );
const drawUtils = require( '@mediapipe/drawing_utils/drawing_utils.js' );
const { gui } = require( 'dat.gui' );
const THREE = require( 'three' );
// import * as THREE from 'three';
// const OrbitControls = require( 'three/examples/jsm/controls/OrbitControls.js' );
// import OrbitControls from 'three/examples/jsm/controls/OrbitControls.js';
import {OrbitControls} from './OrbitControls.js';
//const mediaStream = require('media-stream-library');
//const MjpegCamera = require('mjpeg-camera');
// const { pipelines, isRtcpBye } = window.mediaStreamLibrary

// console.log( OrbitControls ); 

const model = {};

init();

async function init() {

  model.version = '0.3.1';

  // HTML

  model.html = {};

  //// Inputs
  model.html.videoElement = document.querySelector( '#input_video' );
  model.html.imgElement = document.querySelector( '#input_img' );
  model.html.inputElement = model.html.videoElement;

  model.html.videoCanvasElement = document.querySelector( '#input_video_canvas' );
  model.html.videoCanvasCtx = model.html.videoCanvasElement.getContext( '2d' );
  
  model.html.inputElement.onloadeddata = onVideoLoaded;
  model.html.imgElement.onloadeddata = onVideoLoaded;

  //// Outputs
  model.html.buffer = document.querySelector( '#buffer_canvas' );

  model.html.canvasElement = document.querySelector( '#output_canvas' );
  model.html.canvasCtx = model.html.canvasElement.getContext( '2d' );

  model.html.viewerElement = document.querySelector( '#viewer_container' );

  model.html.logElement = document.querySelector( '#log' );
  model.html.logLiveElement = document.querySelector( '#logLive' );
  
  
  println( 'Initialising...' )

  model.boundingBox = [
    {
      x: 0,
      y: 0
    },
    {
      x: 1,
      y: 1
    },
  ];

  document.body.addEventListener( "keypress", onKeyPress );
  document.body.addEventListener( "pointerdown", onMouseDown );
  document.body.addEventListener( "pointermove", onMouseMove );
  document.body.addEventListener( "pointerup", onMouseUp );

  window.addEventListener( 'resize', () => onWindowResize( model.aspectRatio ) );

  model.mouse = {
    drag: false,
    startPos: {
      x: 0,
      y: 0
    },
    currentPos: {
      x: 0,
      y: 0
    },
    isNear: ( x, y, dist ) => {
      return Math.abs( model.mouse.currentPos.x - x ) < dist &&
        Math.abs( model.mouse.currentPos.y - y ) < dist
    }
  }

  // Settings

  println( 'Loading settings...' );

  const windowId = remote.getCurrentWebContents().id
  // const enableReadSettings = false;
  const enableReadSettings = true;
  
  // Set settings URL based on dev or produciton build. defaultApp == development == "electron ." command.
  model.settingsURL = remote.process.defaultApp ?
  path.join( __dirname, '..', 'data', 'settings.json' ) :
    path.join( __dirname, '..', '..', '..', 'data', 'settings.json' );

    console.log( {isPackaged: remote.process.defaultApp });

  model.settings = loadSettings( windowId, enableReadSettings, model.settingsURL );
  // console.log( '[INIT]: Settings loaded.' );
  println( 'Settings loaded!' );
  console.log( { Settings: model.settings } );

  // Add global functions to an object so they can be easily used in GUI. More stable than using window[] functions.
  model.addWindow = () => ipcRenderer.send( 'addWindow' );
  model.saveSettings = () => saveSettings();
  model.clearSettings = () => { fs.writeFileSync( model.settingsURL, ''); console.log( 'settings.json cleared!' ); };

  console.log( `Electron window ID: ${windowId}` );

  // OSC

  println( 'Opening OSC...' )
  model.osc = openOSC( model.settings.osc.host, model.settings.osc.port );
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

  println( 'Generating audio element...' );
  // Audio playback to ensure camera keeps rendering even when window is not in focus
  generateAudioElement( path.join( __dirname, '..', 'assets', 'silent.mp3' ) )
  
  // Stats

  println( 'Generating stats...' );
  model.stats = new Stats();
  model.stats.showPanel( 0 );
  document.body.appendChild( model.stats.dom );

  // Input

  println( 'Getting source devices...' );
  model.settings.input.availableSources.video = await getDevices();
  console.log( { availableSources: model.settings.input.availableSources.video })
  
  model.settings.input.sourceName = getSourceName( model.settings.input.source );
  
  println( `Setting media stream to ${ model.settings.input.sourceName }...` );
  await setInputSource( model.settings.input.source );

  model.aspectRatio = 1920 / 1080;
  
  // GUI

  println( 'Generating GUI...' );
  model.gui = generateGUI( model.settings );
  // model.gui.domElement.style.width = '400px'
  model.gui.close();

  // BlazePose

  println( 'Initialising BlazePose...' );
  model.pose = new Pose.Pose( {
    locateFile: ( file ) => {
      return `${__dirname}/../node_modules/@mediapipe/pose/${file}`;
    }
  } );

  model.pose.ready = true;
  model.pose.setOptions( model.settings.pose.options );
  model.pose.onResults( onResults );
  model.poseResults = {};

  // Camera  



  //   const authorize= async ( host = '192.168.0.200' ) => {
  //     // Force a login by fetching usergroup
  //     const fetchOptions = {
  //       credentials: 'include',
  //       headers: {
  //         'Axis-Orig-Sw': true,
  //         'X-Requested-With': 'XMLHttpRequest',
  //       },
  //       mode: 'no-cors',
  //     }
  //     try {
  //       await window.fetch( `http://${host}/axis-cgi/usergroup.cgi`, fetchOptions )
  //     } catch ( err ) {
  //       console.error( err )
  //     }
  //   }

  // const play = ( host = '192.168.0.200', encoding = 'jpeg' ) => {

  //   let mediaElement = model.html.videoCanvasElement;

  //   // Setup a new pipeline
  //   const pipeline = new pipelines.Html5CanvasPipeline( {
  //     ws: { uri: `ws://${host}/rtsp-over-websocket` },
  //     rtsp: { uri: `rtsp://${host}/axis-media/media.amp?videocodec=${encoding}` },
  //     mediaElement,
  //   } )

  //   // Restart stream on RTCP BYE (stream ended)
  //   pipeline.rtsp.onRtcp = ( rtcp ) => {
  //     if ( isRtcpBye( rtcp ) ) {
  //       setTimeout( () => play( host, encoding ), 0 )
  //     }
  //   }

  //   pipeline.ready.then( () => {
  //     pipeline.rtsp.play()
  //   } )

  //   return pipeline
  // }

  // let pipeline;

  // async function startIpStream() {
  //   pipeline && pipeline.close()
  //   await authorize()
  //   pipeline = play()
  // }

  // startIpStream()

  // model.camera = new Camera( model.html.videoCanvasElement, {
  //   onFrame: onFrame,
  //   width: model.html.inputElement.videoWidth,
  //   height: model.html.inputElement.videoHeight
  // } );

  // model.camera.start();

  // Viewer

  model.viewer = ( () => {

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 1000 );
    camera.position.x = -4;
    camera.position.y = 3;
    camera.position.z = 4;
  
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize( window.innerWidth * 0.5, window.innerHeight * 0.5 );
    model.html.viewerElement.appendChild( renderer.domElement );

    const controls = new OrbitControls( camera, renderer.domElement );
    controls.target = new THREE.Vector3( 0, 2, 0 );

    const clock = new THREE.Clock();
    clock.start();

    // const light = new THREE.AmbientLight( 0xffffff );
    // scene.add( light );
    const light = new THREE.HemisphereLight( 0xffffff, 0x080820, 1 );
    scene.add( light );

    scene.background = new THREE.Color( 0x555555 );
    scene.add( new THREE.GridHelper( 20, 20 ))

    const objects = {};
  
    const boxGeo = new THREE.BoxGeometry( 1, 1, 1 );
    const normalMat = new THREE.MeshNormalMaterial();
    objects.cube = new THREE.Mesh( boxGeo, normalMat );
    objects.cube.position.x = 5;
    scene.add( objects.cube );


    const sphereGeo = new THREE.SphereGeometry( 0.1 );

    // console.log( { arrayTest: Array( 10 ).fill( { k: 'v' } ) } )

    model.pose.landmarkCount = 33;
    objects.poses = [];
    objects.poses.push( ( ( scene, color, landmarksSource ) => {

      const colorMat = new THREE.MeshStandardMaterial( { color: color } );

      const posePoints = [];
  
      for ( let i = 0; i < model.pose.landmarkCount; i++ ) {
        posePoints[ i ] = new THREE.Mesh( sphereGeo, colorMat );
        scene.add( posePoints[ i ] );
      }
  
      const lineMat = new THREE.LineBasicMaterial( { color: 0x0000ff } );
      
      const points = [];
  
      for ( let i = 0; i < Pose.POSE_CONNECTIONS.length; i++ ) {
        
        points.push( new THREE.Vector3() );
        points.push( new THREE.Vector3() );
  
      }    

      const lineGeo = new THREE.BufferGeometry().setFromPoints( points );
  
      const lines = new THREE.LineSegments( lineGeo, lineMat );
      scene.add( lines );

      return {
        posePoints: posePoints,
        lines: lines,
        landmarksSource: landmarksSource
      }

    })( scene, 0xff0000, 'self' ) );
    



    
    // for ( let p of objects.posePoints ) {
    //   // e = new THREE.Mesh( sphereGeo, normalMat);
    //   p.position.x = ( Math.random() - 0.5 ) * 5;
    //   p.position.y = ( Math.random() - 0.5 ) * 5;
    //   p.position.z = ( Math.random() - 0.5 ) * 5;

    //   scene.add( p );

    // }

    return { 
      scene: scene,
      camera: camera,
      renderer: renderer,
      clock: clock,
      objects: objects,
      controls: controls
    }

  })()

  println( 'Init done!' );
  println( 'Starting loop...' );

  loop();
}

function loop() {

  model.stats.begin();

  if ( 
    model.html.canvasElement.width > 0 && model.html.canvasElement.height > 0 &&
    model.videoLoaded
    ) inputLoop();

  function inputLoop() {
    const args = {
      video: model.html.inputElement,
      in: model.html.videoCanvasElement,
      inCtx: model.html.videoCanvasCtx,
      out: model.html.canvasElement,
      outCtx: model.html.canvasCtx,
      buffer: model.html.buffer,
      pose: model.pose
    }

    args.inCtx.drawImage( args.video, 0, 0, args.in.width, args.in.height );

    if ( model.settings.input.rotate != 0 ) {

      rotate(
        args.in,
        args.inCtx,
        args.buffer,
        model.settings.input.rotate
      )
    }

    if ( !!model.settings.input.mirror ) {
      mirror(
        args.in,
        args.inCtx
      );
    }

    const x1 = model.boundingBox[ 0 ].x * args.in.width;
    const y1 = model.boundingBox[ 0 ].y * args.in.height;
    const x2 = model.boundingBox[ 1 ].x * args.in.width;
    const y2 = model.boundingBox[ 1 ].y * args.in.height;

    args.outCtx.clearRect( 0, 0, args.out.width, args.out.height )

    let elementToDraw = args.in;

    // Draw the image in the boundingBox from in to out.
    if ( model.settings.input.freeze ) {
      elementToDraw = args.buffer;
    } else {
      args.buffer.getContext( '2d' ).drawImage( args.in, 0, 0, args.buffer.width, args.buffer.height );
    }

    args.outCtx.drawImage(
      elementToDraw,
      x1,
      y1,
      x2 - x1,
      y2 - y1,
      0,
      0,
      ( ( x2 - x1 ) / ( y2 - y1 ) ) * args.out.height,
      args.out.height,
    )


    // Draw the bounding box.

    const cornerSize = 40;
    const halfCorner = cornerSize * 0.5;
    args.inCtx.lineWidth = 3;
    args.inCtx.strokeStyle = 'yellow';

    args.inCtx.strokeRect(
      x1,
      y1,
      x2 - x1,
      y2 - y1,
    )

    // Draw the bounding box corners for dragging.
    args.inCtx.strokeStyle = 'red';
    args.inCtx.strokeRect(
      x1 - halfCorner,
      y1 - halfCorner,
      cornerSize,
      cornerSize,
    )
    args.inCtx.strokeRect(
      x2 - halfCorner,
      y2 - halfCorner,
      cornerSize,
      cornerSize,
    )

    // Send output element frame to BlazePose.
    if ( !!model.pose.ready ) {
      try {
        model.pose.send( { image: model.html.canvasElement } );
        model.pose.ready = false;
      } catch ( e ) {
        console.error( e );
      }
    }
    
  }


  // Viewer

  if ( model.settings.viewer.enable ) viewerLoop();
  
  function viewerLoop() {
    
    if ( model.poseResults.poseLandmarks ) {
  
      model.viewer.objects.poses.forEach( ( pose, index ) => {
        
        let i = 0;
        let scale = -1;
        let yOffset = model.settings.viewer.yOffset;
    
        const pwl = pose.landmarksSource == 'self' ? model.poseResults.poseLandmarks : [];
        const m = [];
        const pp = pose.posePoints;
        
        // Adjusting original values to scene proportions to dummy array
        for ( let i = 0; i < pwl.length; i++ ) {
    
          m[ i ] = {};
    
          m[ i ].x = ( pwl[ i ].x * scale );
          m[ i ].y = ( pwl[ i ].y * scale ) + yOffset;
          m[ i ].z = ( pwl[ i ].z * scale );
          // m[ i ].x = ( pwl[ i ].x );
          // m[ i ].y = ( pwl[ i ].y ) + yOffset;
          // m[ i ].z = ( pwl[ i ].z );
    
        }
    
        // Assign dummy array values to posePoints positions.
        for ( let i = 0; i < pp.length; i++ ) {
    
          pp[ i ].position.x = m[ i ].x;
          pp[ i ].position.y = m[ i ].y;
          pp[ i ].position.z = m[ i ].z;
    
        }

        if ( index == 0 ) {
          
          clearLog( model.html.logLiveElement );
          println( `<b>Nose</b>`, model.html.logLiveElement );
          println( `x: ${pwl[0].x.toFixed( 2 )}`, model.html.logLiveElement );
          println( `y: ${pwl[0].y.toFixed( 2 )}`, model.html.logLiveElement );
          println( `z: ${pwl[0].z.toFixed( 2 )}`, model.html.logLiveElement );
          println( `visibility: ${pwl[0].visibility.toFixed( 2 )}`, model.html.logLiveElement );
          println( '', model.html.logLiveElement )
          println( `<b>Right Hip</b>`, model.html.logLiveElement );
          println( `x: ${pwl[24].x.toFixed( 2 )}`, model.html.logLiveElement );
          println( `y: ${pwl[24].y.toFixed( 2 )}`, model.html.logLiveElement );
          println( `z: ${pwl[24].z.toFixed( 2 )}`, model.html.logLiveElement );
          println( `visibility: ${pwl[23].visibility.toFixed( 2 )}`, model.html.logLiveElement );

        }
        
    
      //   for ( let i = 0; i < Pose.POSE_CONNECTIONS.length; i++ ) {
    
      //     const lp = pose.lines.geometry.attributes.position;
      //     const l1 = pwl[ Pose.POSE_CONNECTIONS[ i ][ 0 ] ];
      //     const l2 = pwl[ Pose.POSE_CONNECTIONS[ i ][ 1 ] ];
    
      //     const j = i * 6;
    
      //     lp[ j ] = l1.x;
      //     lp[ j + 1] = l1.y;
      //     lp[ j + 2] = l1.z;
      //     lp[ j + 3] = l2.x;
      //     lp[ j + 4] = l2.y;
      //     lp[ j + 5] = l2.z;
    
      //   }

      })
  
    }
  
    model.viewer.delta = model.viewer.clock.getDelta();
    model.viewer.speed = 0.2;

    model.viewer.objects.cube.rotateX( model.viewer.delta * model.viewer.speed );
    model.viewer.objects.cube.rotateY( model.viewer.delta * model.viewer.speed * 2 );
  
  
    // model.viewer.scene.rotateY( model.viewer.delta * model.viewer.speed );
  
    model.viewer.controls.update();
    model.viewer.renderer.render( model.viewer.scene, model.viewer.camera )

  }

  //

  // Log info to HTML DOM Element
  model.html.logElement.innerHTML = generateLogContent( model );

  requestAnimationFrame( loop );

  model.stats.end();

  //

  function rotate( element, context, buffer, angle ) {

    const w = element.width;
    const h = element.height;

    const x = element.width * 0.5;
    const y = element.height * 0.5;

    const angleInRadians = angle * ( Math.PI / 180 );

    const bufferCtx = buffer.getContext( '2d' ); 

    bufferCtx.drawImage( element, 0, 0, w, h );
    context.clearRect( 0, 0, w, h );

    // Rotate magic
    context.translate( x, y );
    context.rotate( angleInRadians );

    // Draw video frame to output canvas context.
    // Sizing based on whether it's landscape or portrait.
    if ( angle % 180 === 0 ) {
      context.drawImage( buffer, - w * 0.5, - h * 0.5, w, h )
    } else {
      const ratioHeight = h / model.aspectRatio;
      context.drawImage( buffer, - ( h * 0.5 ), - ( ratioHeight * 0.5 ), h, ratioHeight  );
    }

    // Revert global changes to context
    context.rotate( -angleInRadians );
    context.translate( -x, -y );

  }

  function mirror( element, context ) {

    let w = element.width;
    let h = element.height;

    // Mirror magic
    context.scale( -1, 1 );
    w = -w;

    // Draw video frame to output canvas context
    context.drawImage( element, 0, 0, w, h )

    // Revert global changes to context
    context.scale( -1, 1 );

  }

}

/**
 * Callback function that processes results from BlazePose.
 * Draws the results onto landmarks and connectors on a canvas,
 * then sends the landmark coordinates as OSC messages in the format specified in model.settings.osc.send_format
 * 
 * Returns if there are no landmarks.
 * 
 * @param { Object } results Results from BlazePose. 
 */
function onResults( results ) {

  model.poseResults = results;

  // Clear rect first so the old landmarks are gone if new results are null.
  // model.html.canvasCtx.clearRect( 0, 0, model.html.canvasElement.width, model.html.canvasElement.height );

  if ( results.poseLandmarks == null ) {
    model.pose.ready = true;
    return;
  }

  // model.html.canvasCtx.save();

  if ( model.settings.draw.segmentationMask ) {
    model.html.canvasCtx.drawImage( results.segmentationMask, 0, 0,
      model.html.canvasElement.width, model.html.canvasElement.height );
  }

  // Draw connectors and landmarks

  if ( model.settings.draw.landmarks ) {
    model.html.canvasCtx.globalCompositeOperation = 'source-over';
    drawUtils.drawConnectors( model.html.canvasCtx, results.poseLandmarks, Pose.POSE_CONNECTIONS,
      { color: '#aaff00', lineWidth: model.settings.draw.connectorSize } );
    drawUtils.drawLandmarks( model.html.canvasCtx, results.poseLandmarks,
      { color: '#ff0000', lineWidth: model.settings.draw.landmarkSize } );
  }

  // Send OSC messages in the message rate defined in model.settings.
  if ( model.settings.osc.enable &&
     ( ( Date.now() - model.oscTimer ) > ( 1000 / model.settings.osc.msgsPerSecond ) ) ) {

    // console.log( { sendFormat: model.settings.osc.send_format } );
    
    // Send OSC through the function named as a string in model.settings.
    try {
      window[ model.settings.osc.send_format ]( results, model.osc );
    } catch ( e ) {
      
    }
    model.oscTimer = Date.now();

  }
  
  model.pose.ready = true;

}

// Settings

function loadSettings( windowId = 1, enableReadSettings = true, settingsURL = 'settings.json' ) {

  console.log( '[FUNC]: loadSettings() - called with enableRead:', enableReadSettings )

  let stockParams = {
    global: {
      id: 1,
      showStats: true,
      enableReadSettings: true,
      guiWidth: 380,
    },
    input: {
      source: '',
      sourceName: '',
      axisCameraIP: '192.168.0.90',
      mirror: true,
      rotate: 0,
      freeze: false,
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
    viewer: {
      enable: true,
      yOffset: 3
    },
    osc: {
      enable: true,
      send_format: 'sendPosesJSON',
      host: 'localhost',
      port: '9527',
      msgsPerSecond: 30,
    },
    windowId: windowId,
  }

  if ( !enableReadSettings ) {
    console.log( '[FUNC]: loadSettings() - enableReadSettings is false. Returning stock settings...'   );
    return stockParams;
  }

  //

  const settings = fs.readFileSync( settingsURL, "utf8" );
  console.log( '[FUNC]: loadSettings() - Reading settings.json...');
  let settingsArray = [];
  let index = 0;

  try {
    settingsArray = JSON.parse( settings );
    console.log( '[FUNC]: loadSettings() - settings.json has elements.'   );
  } catch ( e ) {
    console.log( '[FUNC]: loadSettings() - settings.json is empty. Returning stock settings...' );
    return stockParams;
  }

  const foundElement = settingsArray.find( ( e ) => e.windowId === windowId );
  if ( !foundElement ) {
    console.log( '[FUNC]: loadSettings() - No settings found for this window ID. Returning stock settings...');
    return stockParams;
  }
  
  //
  
  console.log( '[FUNC]: loadSettings() - Found settings for this window ID. Loading...');
  return foundElement;

}

function saveSettings() {

  const settings = fs.readFileSync( model.settingsURL, "utf8" );

  let settingsArray = [];
  let index = 0;

  try {
    settingsArray = JSON.parse( settings );
    console.log( '[FUNC]: saveSettings() - Settings on file parsed to JSON.');
  } catch ( e ) {
    console.log( 'Cannot parse settings into JSON.\n\n', e );
  }

  index = settingsArray.findIndex( ( e ) => e.windowId == model.settings.windowId );

  // If index is not found, set index to the end of the array
  if ( index > -1 ) {
    console.log( '[FUNC]: saveSettings() - Window ID found in settings. Replacing element...' );
    settingsArray[ index ] = model.settings;
  } else {
    console.log( '[FUNC]: saveSettings() - Window ID not found in settings. Appending new element...' );
    settingsArray.push( model.settings );
  }

  fs.writeFile(
    model.settingsURL,
    JSON.stringify( settingsArray, null, 2 ),
    ( err ) => {
      if ( err ) {
        console.error( err )
      } else {
        console.log( '[FUNC]: saveSettings() - Settings saved!' );
      }
    }
  );
}

// Input

/**
 * Gets stream from source, sets it to element.
 * */
async function getStream( sourceId ) {

  if ( window.stream ) {
    window.stream.getTracks().forEach( track => track.stop() );
  }

  const constraints = {
    // video: { deviceId: sourceId ? { ideal: sourceId } : undefined }
    video: { deviceId: sourceId }
  };

  let stream;

  try {

    stream = await navigator.mediaDevices.getUserMedia( constraints );

  } catch ( err ) {

    console.error( err );
    console.log( 'Could not open camera from loaded settings. Opening default camera...' );
    
    const sourceIdArray = Object.values( model.settings.input.availableSources.video )[0]

    console.log( { sourceIdArray: sourceIdArray } );

    // Get the first enumerable key from availableSources and grab the value of that.
    // const defaultSourceId = model.settings.input.availableSources[ sourceIdArray[0] ];
    const defaultSourceId = sourceIdArray[0];

    stream = getStream( defaultSourceId );

  }

  return stream;

}

/**
 * Enumerates through media devices and returns available devices in an object.
 * 
 * @returns An object with deviceLabel as keys and deviceId as values.
 */
async function getDevices() {
  // AFAICT in Safari this only gets default devices until gUM is called :/
  const deviceInfos = await navigator.mediaDevices.enumerateDevices();

  let sources = {};

  for ( const deviceInfo of deviceInfos ) {
    if ( deviceInfo.kind === 'videoinput' ) {
      sources[ deviceInfo.label ] = deviceInfo.deviceId;
    }
  }

  sources[ 'Axis Camera' ] = `http://${model.settings.input.axisCameraIP}/mjpg/1/video.mjpg`;

  return sources;

}

function getSourceName( sourceId ) {

  return Object
    .keys( model.settings.input.availableSources.video )
    .find( key => model.settings.input.availableSources.video[ key ] == sourceId );

}

function getAspectRatio( sourceElement ) {

  let w, h;

  if ( sourceElement.localName == 'video' ) {
    w = sourceElement.videoWidth
    h = sourceElement.videoHeight;
    console.log( 'called video route')
  } else {
    w = sourceElement.width
    h = sourceElement.height;
  }

  console.log( "Camera dimensions", w, h );
  
  ipcRenderer.send( 'resize', document.body.innerWidth, document.body.innerHeight ); //w, h);
  
  model.videoLoaded = true;
  println( 'Video loaded!' );

  return w / h;

}

async function setInputSource( sourceId ) {

  println( `Switching input to ${model.settings.input.sourceName}...`, model.html.logLiveElement)
  model.videoLoaded = false;

  model.settings.input.sourceName = Object.keys( model.settings.input.availableSources.video ).find( key => model.settings.input.availableSources.video[ key ] == sourceId );
  
  console.log( `Switching camera to ${model.settings.input.sourceName}` );

  if ( sourceId == model.settings.input.availableSources.video[ 'Axis Camera' ] ) {
    model.html.videoElement = model.html.inputElement;
    model.html.inputElement = model.html.imgElement;
    try {
      model.html.inputElement.src = sourceId;
    } catch( e ) {
      console.error( e );
    }
    return;
  } else if ( model.html.inputElement.localName != 'video' ) {
    model.html.inputElement = model.html.videoElement;
  }
  const stream = await getStream( sourceId );
  console.log( stream );
  model.html.inputElement.srcObject = stream;

  

} 

// Generate

/**
 * Generate a dat.GUI interface using supplied parameters.
 * 
 * @param {Object} settings The parameters to use.
 */
function generateGUI( settings ) {

  let gui = new dat.GUI( { width: settings.global.guiWidth });
  
  let folderGlobal = gui.addFolder( 'Global' );
  folderGlobal.add( settings.global, 'id', 1, 10 ).name( 'ID' ).step( 1 );
  // folderGlobal.add( settings.global, 'enableReadSettings' ).name( 'Enable read settings');
  // folderGlobal.add( model, 'loadSettings' ).name( 'Manual read settings.json');
  folderGlobal.add( model, 'clearSettings' ).name( 'Clear settings.json');
  folderGlobal.add( settings.global, 'guiWidth', 250, 500 ).name( 'GUI width' ).onChange( (val) => model.gui.width = val );

  let folderInput = gui.addFolder( 'Input' );
  folderInput.add( settings.input, 'source', settings.input.availableSources.video )
    .name( 'Input Source' )
    .onChange( async ( sourceId ) => setInputSource( sourceId ))
    .listen();
  folderInput.add( settings.input, 'axisCameraIP' ).name( 'Axis Camera IP' ).onFinishChange( ( ip ) => {
    const oldSource = settings.input.availableSources.video[ 'Axis Camera' ]
    settings.input.availableSources.video[ 'Axis Camera' ] = `http://${ip}/mjpg/1/video.mjpg`;
    if ( settings.input.source == oldSource ) {
      try {
        model.html.inputElement.src = settings.input.availableSources.video[ 'Axis Camera' ];
      } catch ( e ) {
        console.error( 'Could not connect to Axis Camera. Check IP address? Error:', e );
      }
    }

  } )
  folderInput.add( settings.input, 'freeze' );
  folderInput.add( settings.input, 'mirror' );
  folderInput.add( settings.input, 'rotate', 0, 270 ).step( 90 );
  folderInput.add( model, 'addWindow' ).name( 'Add input' );

  let folderPose = gui.addFolder( 'Pose' );
  // { lite: 0, full: 1, heavy: 2 }
  folderPose.add( settings.pose.options, 'modelComplexity', 0, 2 ).step( 1 ).onChange( () => model.pose.setOptions( settings.pose.options ) );
  folderPose.add( settings.pose.options, 'minDetectionConfidence', 0, 1 ).step( 0.01 ).onChange( () => model.pose.setOptions( settings.pose.options ) );
  folderPose.add( settings.pose.options, 'minTrackingConfidence', 0, 1 ).step( 0.01 ).onChange( () => model.pose.setOptions( settings.pose.options ) );

  let folderDraw = gui.addFolder( 'Draw' );
  folderDraw.add( settings.draw, 'segmentationMask' )
  folderDraw.add( settings.draw, 'landmarkSize', 0, 10 ).step( 0.1 );
  folderDraw.add( settings.draw, 'connectorSize', 0, 10 ).step( 1 );

  let folderViewer = gui.addFolder( '3D Viewer' );
  folderViewer.add( settings.viewer, 'enable' )
  folderViewer.add( settings.viewer, 'yOffset', 0, 10 ).step( 0.1 );
  // folderViewer.add( settings.viewer, 'connectorSize', 0, 10 ).step( 1 );

  let folderOsc = gui.addFolder( 'OSC' );
  folderOsc.add( settings.osc, 'enable' )
  folderOsc.add( settings.osc, 'send_format', {
    ADDR: 'sendPosesADDR',
    JSON: 'sendPosesJSON',
    // ARR:  'sendPosesARR',
    // XML:  'sendPosesXML'
  } )
  folderOsc.add( settings.osc, 'host' )
  folderOsc.add( settings.osc, 'port' )
  folderOsc.add( settings.osc, 'msgsPerSecond', 1, 60 ).step( 1 );

  return gui;

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

/**
 * Composes a string with HTML formatting.
 * 
 * @returns String to log into HTML DOM.
 */
function generateLogContent( model ) {

  const str = `
  <b>Version ${model.version}</b>

  ID:
  ${model.settings.global.id}

  Camera:
  ${model.settings.input.sourceName}

  Dimensions:
  [${model.html.inputElement.width}, ${model.html.inputElement.height}]

  OSC sending to:
  ${model.settings.osc.host}:${model.settings.osc.port}
  `;

  // Replaces line breaks with HTML line break formatting.
  let lines = str.split( '\n' );
  lines.splice( 0, 1 );               // And splices the top and bottom line breaks so editing can stay pretty.
  lines.splice( lines.length - 1, 1 );
  // lines.forEach( ( e, i ) => { if ( i % 3 == 0 ) e = '<b>' + e + '</b>' } );
  let log = lines.join( '<br>' );

  return log;

}

// Events

function onKeyPress( event ) {

  switch ( event.key ) {

    // C for console.log
    case 'c':
      console.log( {
        model: model,
        drawUtils, drawUtils,
        camera: model.camera,
        CameraImport: Camera,
        pose: model.pose,
        results: model.poseResults,
        gui:model.gui,
        scene: model.viewer.scene,
        camera: model.viewer.camera,
        connections: Pose.POSE_CONNECTIONS,
        keypointNames: model.keypointNames,
      } );
      break;

    case 'g':
      // dat.GUI.toggleHide();
      model.settings.global.showStats = !model.settings.global.showStats;

      if ( model.settings.global.showStats ) {
        model.gui.show();
        model.stats.dom.style.display = "block";
      } else {
        model.gui.hide();
        model.stats.dom.style.display = "none";
        saveSettings();
      }

      break;

    case 'r':
      window.open( './blazepose-recorder.html', target = "_self" );

    case 'f':
      ipcRenderer.send( 'float' );
      break;

    case ' ':
      model.settings.input.freeze = !model.settings.input.freeze;
      break;
  }
}

function onMouseDown( e ) {

  model.mouse.startPos.x = e.x;
  model.mouse.startPos.y = e.y;

  model.mouse.currentPos.x = e.x;
  model.mouse.currentPos.y = e.y;

  model.mouse.drag = true;

  model.mouse.clickedCorner = model.boundingBox.findIndex(
    ( elem ) => model.mouse.isNear( elem.x * model.html.videoCanvasElement.width, elem.y * model.html.videoCanvasElement.height, 40 ) );

  // console.log( 'mouseDown, ', {
  //   clickedCorner: model.mouse.clickedCorner,
  //   ex: e.x,
  //   ey: e.y,
  //   boundingBoxes: model.boundingBox,
  //   bb1x: model.boundingBox[ 1 ].x * model.html.videoCanvasElement.width,
  //   bb1y: model.boundingBox[ 1 ].y * model.html.videoCanvasElement.height,
  // } )
}

function onMouseMove( e ) {

  if ( !model.mouse.drag ) return;

  // Check to avoid micro-drags
  // if ( Math.abs( e.x - model.mouse.startPos.x ) > model.mouse.delta && Math.abs( e.y - model.mouse.startPos.y ) > model.mouse.delta  ) {

  model.mouse.currentPos.x = e.x;
  model.mouse.currentPos.y = e.y;
  if ( model.mouse.clickedCorner > -1 ) {

    const bx = model.boundingBox[ model.mouse.clickedCorner ].x
    const by = model.boundingBox[ model.mouse.clickedCorner ].y

    const cw = model.html.videoCanvasElement.width;
    const ch = model.html.videoCanvasElement.height;

    const mx = model.mouse.currentPos.x;
    const my = model.mouse.currentPos.y;

    model.boundingBox[ model.mouse.clickedCorner ].x = mx < 0 || cw < mx ? bx : mx / cw;
    model.boundingBox[ model.mouse.clickedCorner ].y = my < 0 || ch < my ? by : my / ch;

    // console.log( {
    //   bx: bx,
    //   by: by,
    //   cw: cw,
    //   ch: ch,
    //   mx: mx,
    //   my: my
    // })
  }



  // console.log( 'mousemove,', e );
}

function onMouseUp( e ) {

  model.mouse.drag = false;
  // console.log( 'mouseUp, ', e )

}

function onWindowResize( ratio ) {

  const initW = model.html.videoCanvasCtx.canvas.width;
  const initH = model.html.videoCanvasCtx.canvas.height;

  // document.body.innerWidth * 0.5;
  const halfDW = window.innerWidth * 0.5;
  const halfDH = window.innerHeight * 0.5;

  const maxWidth = halfDH * ratio

  const maxHeightReached = maxWidth < halfDW;

  const targetW = maxWidth;
  const targetH = halfDH;

  model.html.videoCanvasCtx.canvas.width = targetW;
  model.html.videoCanvasCtx.canvas.height = targetH;
  model.html.canvasCtx.canvas.width = targetW;
  model.html.canvasCtx.canvas.height = targetH;
  model.html.buffer.width  = targetW;
  model.html.buffer.height = targetH;

  model.html.viewerElement.width = halfDW;
  model.html.viewerElement.height = halfDH;
  model.viewer.renderer.setSize( halfDW, halfDH );
  // if ( model.viewer.camera.aspect ) 
  model.viewer.camera.aspect = halfDW / halfDH;

  document.body.style.fontSize = Math.max( ( ( window.innerWidth / 800 ) ).toFixed( 2 ), 0.7 ) + 'em';

}

function onVideoLoaded() {

  model.aspectRatio = getAspectRatio( model.html.inputElement );
  onWindowResize( model.aspectRatio );
  model.videoLoaded = true;

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
  osc.send( new OSC.Message( `/poses/json/${model.settings.global.id}`, JSON.stringify( poses.poseLandmarks ) ) );
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

function println( str = '', elem = model.html.logElement ) {

  elem.innerHTML += str + '<br>' ;

}

function clearLog( elem ) {

  elem.innerHTML = '';

}