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
const { ipcRenderer, remote } = require( 'electron' );
const Pose = require( '@mediapipe/pose/pose.js' )
const OSC = require( 'osc-js' );
const dat = require( 'dat.gui' );
const Stats = require( 'stats.js' );
const { Camera } = require( '@mediapipe/camera_utils' );
const drawUtils = require( '@mediapipe/drawing_utils/drawing_utils.js' );
const { gui } = require( 'dat.gui' );
//const mediaStream = require('media-stream-library');
//const MjpegCamera = require('mjpeg-camera');
// const { pipelines, isRtcpBye } = window.mediaStreamLibrary

const model = {};

init();
loop();


function init() {

  // Settings

  const id = remote.getCurrentWebContents().id
  console.log( `Window ID: ${id}` );
  const enableReadSettings = true;
  const settingsURL = 'settings.json'

  model.params = loadParams( id, enableReadSettings, settingsURL );

  console.log( model.params );

  model.addWindow = () => ipcRenderer.send( 'addWindow' );

  // HTML

  model.html = {};

  //// Inputs
  model.html.videoElement = document.getElementById( 'input_video' );
  model.html.videoCanvasElement = document.getElementById( 'input_video_canvas' );
  model.html.videoCanvasCtx = model.html.videoCanvasElement.getContext( '2d' );

  //// Outputs
  model.html.canvasElement = document.getElementById( 'output_canvas' );
  model.html.canvasCtx = model.html.canvasElement.getContext( '2d' );

  model.html.logElement = document.getElementById( 'log' );
  model.html.logElement.innerHTML = `Loading...`;

  model.boundingBox = [
    {
      x: 0,
      y: 0
    },
    {
      x: model.html.videoCanvasElement.width,
      y: model.html.videoCanvasElement.height
    },
  ];

  model.html.videoElement.onloadeddata = function () {

    const w = model.html.videoElement.videoWidth
    const h = model.html.videoElement.videoHeight;

    const aspectRatio = w / h;

    console.log( "camera dimensions", w, h );

    const ch = window.innerHeight * 0.5;
    const cw = ch * aspectRatio;

    model.html.videoCanvasCtx.canvas.width  = cw;
    model.html.videoCanvasCtx.canvas.height = ch;
    model.html.canvasCtx.canvas.width       = cw;
    model.html.canvasCtx.canvas.height      = ch;
    // model.html.videoCanvasCtx.canvas.height = model.html.videoCanvasCtx.canvas.offsetWidth;
    // model.html.videoCanvasCtx.canvas.width  = model.html.videoCanvasCtx.canvas.offsetHeight;
    // model.html.canvasCtx.canvas.height      = model.html.canvasCtx.canvas.offsetWidth;
    // model.html.canvasCtx.canvas.width       = model.html.canvasCtx.canvas.offsetHeight;

    // Bounding box with points in the origin (top-left) and the size (bottom-right).
    model.boundingBox = [
      {
        x: 0,
        y: 0
      },
      {
        x: cw,
        y: ch
      },
    ]

    ipcRenderer.send( 'resize', document.body.innerWidth, document.body.innerHeight ); //w, h);

  }

  document.body.addEventListener( "keypress", onKeyPress );
  document.body.addEventListener( "pointerdown", onMouseDown );
  document.body.addEventListener( "pointermove", onMouseMove );
  document.body.addEventListener( "pointerup", onMouseUp );

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

  ( async () => {
    await getStream( model.params.input.source, model.html.videoElement );
    model.params.input.availableSources.video = await getDevices();
    model.gui = generateGUI( model.params );
  } )()

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
  //   width: model.html.videoElement.videoWidth,
  //   height: model.html.videoElement.videoHeight
  // } );

  // model.camera.start();
}

async function loop() {

  model.stats.begin();

  const args = {
    video: model.html.videoElement,
    in: model.html.videoCanvasElement,
    inCtx: model.html.videoCanvasCtx,
    out: model.html.canvasElement,
    outCtx: model.html.canvasCtx,
    pose: model.pose
  }

  

  args.inCtx.drawImage( args.video, 0, 0, args.in.width, args.in.height );


  if ( model.params.input.rotate != 0 ) {

    // if ( model.params.input.rotate % 180 == 0 ) {
    //   args.in.width = args.video.videoWidth;
    //   args.in.height = args.video.videoHeight;
    // } else {
    //   args.in.width = args.video.videoWidth;
    //   args.in.height = args.video.videoWidth;
    // }

    rotate(
      args.in,
      args.inCtx,
      model.params.input.rotate
    )
  }

  if ( !!model.params.input.mirror ) {
    mirror(
      args.in,
      args.inCtx
    );
  }

  const x1 = model.boundingBox[0].x;
  const y1 = model.boundingBox[0].y;
  const x2 = model.boundingBox[1].x;
  const y2 = model.boundingBox[1].y;

  args.outCtx.clearRect( 0, 0, args.out.width, args.out.height )

  // Draw the image in the boundingBox from in to out.
  args.outCtx.drawImage(
    args.in,
    x1,
    y1,
    x2 - x1,
    y2 - y1,
    0,
    0,
    ( ( x2 - x1 ) / ( y2 - y1 ) ) * args.out.height ,
    args.out.height,
  )

  
  // Draw the bounding box.
  
  const cornerSize = 40;
  const halfCorner = cornerSize * 0.5;
  args.inCtx.lineWidth = 3;
  args.inCtx.strokeStyle = 'yellow' ;

  args.inCtx.strokeRect(
    x1,
    y1,
    x2 - x1,
    y2 - y1,
  )

  // Draw the bounding box corners for dragging.
  args.inCtx.strokeStyle = 'red' ;
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
  await args.pose.send( { image: args.out } )

  // Log info to HTML DOM Element
  model.html.logElement.innerHTML = generateLogContent( model );

  requestAnimationFrame( loop );

  model.stats.end();

  //

  function rotate( element, context, angle ) {

    const w = element.width;
    const h = element.height;

    const x = element.width * 0.5;
    const y = element.height * 0.5;

    const angleInRadians = angle * ( Math.PI / 180 );

    // Rotate magic
    context.translate( x, y );
    context.rotate( angleInRadians );

    // Draw video frame to output canvas context
    context.drawImage( element, - ( w * 0.5 ), - ( h * 0.5 ), w, h );

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
 * then sends the landmark coordinates as OSC messages in the format specified in model.params.osc.send_format
 * 
 * Returns if there are no landmarks.
 * 
 * @param { Object } results Results from BlazePose. 
 */
function onResults( results ) {

  model.poseResults = results;

  // Clear rect first so the old landmarks are gone if new results are null.
  // model.html.canvasCtx.clearRect( 0, 0, model.html.canvasElement.width, model.html.canvasElement.height );

  if ( results.poseLandmarks == null ) return;

  // model.html.canvasCtx.save();

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

  // model.html.canvasCtx.restore();

  // Send OSC messages in the message rate defined in model.params.
  if ( model.params.osc.enable && ( ( Date.now() - model.oscTimer ) > ( 1000 / model.params.osc.msgsPerSecond ) ) ) {

    // Send OSC through the function named as a string in model.params.
    window[ model.params.osc.send_format ]( results, model.osc );
    timer = Date.now();

  }

}

// Settings

function loadParams( id = 1, enableReadSettings = true, settingsURL = 'settings.json' ) {

  let stockParams = {
    global: {
      showStats: true,
      enableReadSettings: false,
    },
    input: {
      source: '',
      mirror: true,
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
    windowId: id,
  }

  if ( !enableReadSettings ) return stockParams;

  //

  const settings = fs.readFileSync( __dirname + `/${settingsURL}`, "utf8" );
  let settingsArray = [];
  let index = 0;

  try {
    settingsArray = JSON.parse( settings );
    console.log( { settingsArray: settingsArray } );
  } catch ( e ) {
    console.log( 'Array is empty.' );
    return stockParams;
  }

  const foundElement = settingsArray.find( ( e ) => e.windowId === id );
  if ( !foundElement )
    return stockParams;

  //

  return foundElement;

}

// Input

/**
 * Gets stream from source, sets it to element.
 * */
async function getStream( sourceId, element ) {
  if ( window.stream ) {
    window.stream.getTracks().forEach( track => track.stop() );
  }

  const constraints = {
    video: { deviceId: sourceId ? { ideal: sourceId } : undefined }
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

  return sources;

}

// Generate

/**
 * Generate a dat.GUI interface using supplied parameters.
 * 
 * @param {Object} params The parameters to use.
 */
function generateGUI( params ) {

  let gui = new dat.GUI();


  let folderSrc = gui.addFolder( 'Input' );
  folderSrc.add( params.input, 'source', params.input.availableSources.video ).name( 'Input Source' ).onChange( ( source ) => getStream( source, model.html.videoElement ) ).listen();
  folderSrc.add( params.input, 'mirror' );
  folderSrc.add( params.input, 'rotate', 0, 270 ).step( 90 );

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

  gui.add( model, 'addWindow' ).name( 'Add input' );

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
function generateLogContent() {

  const str = `
  Pose found:
  ${!!model.poseResults.poseLandmarks}
  
  Camera dimensions:
  [${model.html.videoElement.videoWidth}, ${model.html.videoElement.videoHeight}]
  
  `;

  // Replaces line breaks with HTML line break formatting.
  let lines = str.split( '\n' );
  lines.splice( 0, 1 );               // And splices the top and bottom line breaks so editing can stay pretty.
  lines.splice( lines.length - 1, 1 );
  let log = lines.join( '<br>' );

  return log;

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
        pose: model.pose,
        results: model.poseResults
      } );
      break;

    case 'g':
      // dat.GUI.toggleHide();
      model.params.global.showStats = !model.params.global.showStats;

      if ( model.params.global.showStats ) {
        model.gui.show()
      } else {
        model.gui.hide()
      }

      model.stats.dom.style.display = model.params.global.showStats ? "block" : "none";
      model.html.logElement.style.display = model.params.global.showStats ? "block" : "none";

      const settings = fs.readFileSync( __dirname + "/settings.json", "utf8" );

      let settingsArray = [];
      let index = 0;

      try {
        settingsArray = JSON.parse( settings );
        console.log( { settingsArray: settingsArray } );
      } catch ( e ) {
        console.log( 'Cannot parse settings.\nError:', e );
      }

      index = settingsArray.findIndex( ( e ) => e.windowId == model.params.windowId );

      // If index is not found, set index to the end of the array
      if ( index > -1 ) {
        settingsArray[ index ] = model.params;
        console.log( 'id found. index is:', index )
      } else {
        settingsArray.push( model.params );
      }



      console.log( { beforeWrite: settingsArray } );

      fs.writeFile(
        __dirname + "/settings.json",
        JSON.stringify( settingsArray, null, 2 ),
        ( err ) => {
          if ( err ) {
            console.error( err )
          } else {
            // console.log( 'Parameters saved!' );
          }
        }
      );

      // logDOM.style.display = showStats ? "block" : "none";
      break;

    case 'r':
      window.open( './blazepose-recorder.html', target = "_self" );

    case 'f':
      ipcRenderer.send( 'float' );
      break;
  }
}

function onMouseDown( e ) {
  
  model.mouse.startPos.x = e.x;
  model.mouse.startPos.y = e.y;
  
  model.mouse.currentPos.x = e.x;
  model.mouse.currentPos.y = e.y;
  
  model.mouse.drag = true;

  model.mouse.clickedCorner = model.boundingBox.findIndex( ( elem ) => model.mouse.isNear( elem.x, elem.y, 40 ) );

  console.log( 'mouseDown, ', {
    clickedCorner: model.mouse.clickedCorner,
    ex: e.x,
    ey: e.y,
    boundingBoxes: model.boundingBox,
  } )
}

function onMouseMove( e ) {

  if ( !model.mouse.drag  ) return;
  
  // Check to avoid micro-drags
  // if ( Math.abs( e.x - model.mouse.startPos.x ) > model.mouse.delta && Math.abs( e.y - model.mouse.startPos.y ) > model.mouse.delta  ) {

    model.mouse.currentPos.x = e.x;
    model.mouse.currentPos.y = e.y;
    if ( model.mouse.clickedCorner > -1 ) {

      const bx = model.boundingBox[ model.mouse.clickedCorner ].x
      const by = model.boundingBox[ model.mouse.clickedCorner ].y

      const cw = model.html.canvasElement.width;
      const ch = model.html.canvasElement.height;

      const mx = model.mouse.currentPos.x;
      const my = model.mouse.currentPos.y;

      model.boundingBox[ model.mouse.clickedCorner ].x = 0 < mx || mx < cw ? mx : bx;
      model.boundingBox[ model.mouse.clickedCorner ].y = 0 < my || my < ch ? my : by;

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
  console.log( 'mouseUp, ', e )

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
  poses.id = 'Anfang';
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

