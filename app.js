const fs = require('fs');
const {ipcRenderer} = require('electron');
const Pose  = require('@mediapipe/pose/pose.js')
const OSC = require('osc-js');
const dat = require('dat.gui');
const Stats = require('stats.js');
const { Camera } = require('@mediapipe/camera_utils');
const drawUtils = require('@mediapipe/drawing_utils/drawing_utils.js')

var osc;
var stats = new Stats();
let timer = Date.now();

let params = {
  draw: {
    segmentationMask: true
  },
  source: {
    video: 'facetime',
    audio: 'default'
  },
  OSC:{
    enable: false,
    send_format: 'sendPosesADDR',
    host: 'localhost',
    port: '9527'
  }
}


var keypointNames = ['nose','left_eye_inner','left_eye','left_eye_outer',
                    'right_eye_inner','right_eye','right_eye_outer','left_ear',
                    'right_ear','mouth_left','mouth-right','left_shoulder','right_shoulder',
                    'left_elbow', 'right_elbow', 'left_wrist','right_wrist','left_pinky','right_pinky',
                    'left_index', 'right_index', 'left_thumb','right_thumb','left_hip', 'right_hip', 'left_knee',
                    'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel','left_foot_index','right_foot_index'
]

// GUI setup 
let gui = new dat.GUI();
let folderDraw = gui.addFolder( 'Draw' );
folderDraw.add( params.draw, 'segmentationMask' )

let folderSrc = gui.addFolder( 'Source' );
folderSrc.add( params.source, 'video', {facetime: 'facetime', defaults: 'default'} );
folderSrc.add( params.source, 'audio' );

let folderOSC = gui.addFolder('OSC');
folderOSC.add(params.OSC,'send_format', {sendPosesADDR: 'sendPosesADDR',
                                          sendPosesARR: 'sendPosesARR',
                                          sendPosesJSON: 'sendPosesJSON',
                                          sendPosesXML: 'sendPosesXML'
                                          }) 
folderOSC.add(params.OSC, 'enable')
folderOSC.add(params.OSC, 'host')
folderOSC.add(params.OSC, 'port')

stats.showPanel( 0 );
document.body.appendChild( stats.dom );

var settings = JSON.parse(fs.readFileSync(__dirname +"/settings.json", "utf8"));

function openOSC(){
  osc = new OSC({ plugin: new OSC.DatagramPlugin({
    send:{
      host: settings.host,
      port: settings.port,
    }
  }) });
  osc.open();
}

openOSC()

var Input_camera = document.getElementById('camera');

var audio = document.createElement("audio");
audio.controls = "controls";
audio.loop = "loop";
audio.autoplay = "autoplay";
audio.volume = "0.001";
var source = document.createElement("source");
source.src = "https://www.w3schools.com/html/horse.mp3";
audio.appendChild(source);
audio.style.position = "absolute";
audio.style.left = "200px";
audio.style.top = "0px";
audio.style.display = "none";
document.body.appendChild(audio);

var net = undefined;
var testImage = undefined;
var testImageUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg/637px-Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg";
var frameCount = 0;


navigator.mediaDevices.enumerateDevices().then(function(mediaDevices){
  mediaDevices.forEach(mediaDevice => {
    if (mediaDevice.kind === 'videoinput') {
      console.log("camera found:",mediaDevice.label);
      console.log("deviceId:",mediaDevice.deviceId)
    }
  });
  console.log("copy-paste a deviceId to settings.json to specify which camera to use.")
})

navigator.mediaDevices.getUserMedia({video:settings.cameraConfig})
  .then(function(stream) {
    camera.srcObject = stream;
  }).catch(function() {
    alert('could not connect stream');
});


function sendPosesADDR(poses){
  osc.send(new OSC.Message('/videoWidth',poses.image.width));
  osc.send(new OSC.Message('/videoHeight',poses.image.height));
  //osc.send(new OSC.Message('/nPoses',poses.poseLandmarks.length));
  for (var i = 0; i < poses.poseLandmarks.length; i++){
    var kpt = poses.poseLandmarks[i];
    var pth = '/pose/keypoints/' + keypointNames[i] + "/";
    
    osc.send(new OSC.Message(pth+"x",kpt.x));
    osc.send(new OSC.Message(pth+"y",kpt.y));
    osc.send(new OSC.Message(pth+"z",kpt.z));
    osc.send(new OSC.Message(pth+"visibility",kpt.visibility));
  }
  
}

function sendPosesARR(poses){
  var arr = ["/poses/arr"]
  arr.push(camera.videoWidth);
  arr.push(camera.videoHeight);
  arr.push(poses.length);
  for (var i = 0; i < poses.length; i++){
    arr.push(poses[i].score)
    for (var j = 0; j < poses[i].keypoints.length; j++){
      var kpt = poses[i].keypoints[j];
      arr.push(kpt.position.x);
      arr.push(kpt.position.y);
      arr.push(kpt.score);
    }
  }
  osc.send(new OSC.Message(...arr));
}

function sendPosesXML(poses){
  function rd(n){
    return Math.round(n*100)/100
  }
  var result = `<poses videoWidth="${camera.videoWidth}" videoHeight="${camera.videoHeight}" nPoses="${poses.length}">`;
  for (var i = 0; i < poses.length; i++){
    result += `<pose score="${rd(poses[i].score)}">`
    for (var j = 0; j < poses[i].keypoints.length; j++){
      var kpt = poses[i].keypoints[j];
      result += `<keypoint part="${kpt.part}" x="${rd(kpt.position.x)}" y="${rd(kpt.position.y)}" score="${rd(kpt.score)}"/>`
    }
    result += "</pose>"
  }
  result += `</poses>`

  osc.send(new OSC.Message("/poses/xml",result));
}

function sendPosesJSON(poses){
  osc.send(new OSC.Message("/poses/json",JSON.stringify(poses)));
}


const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

canvasCtx.canvas.width = window.innerWidth;
canvasCtx.canvas.height = 3*window.innerWidth/4;


var [w,h] = [0,0];

Input_camera.onloadeddata = function(){

  [w,h] = [Input_camera.videoWidth, Input_camera.videoHeight];

  console.log("camera dimensions",w,h);

  canvasCtx.canvas.width = w
  canvasCtx.canvas.height = h;

  ipcRenderer.send('resize',document.body.innerWidth, document.body.innerHeight); //w, h);

}

const pose = new Pose.Pose({locateFile: (file) => {
  return `./node_modules/@mediapipe/pose/${file}`;
}});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: true,
  smoothSegmentation: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
pose.onResults(onResults);

const camera = new Camera(Input_camera, {
  onFrame: async () => {
    await pose.send({image: Input_camera});
  },
  width: w,
  height: h
});
camera.start();


function onResults(results) {
  
  if(results.poseLandmarks == null){
    return
  }

  stats.begin();

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if ( params.draw.segmentationMask ) {
    canvasCtx.drawImage(results.segmentationMask, 0, 0,
      canvasElement.width, canvasElement.height);
  }

  // Only overwrite existing pixels.
  canvasCtx.globalCompositeOperation = 'source-in';
  canvasCtx.fillStyle = '#00FF00';
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  // Only overwrite missing pixels.
  canvasCtx.globalCompositeOperation = 'destination-atop';
  canvasCtx.drawImage(
      results.image, 0, 0, canvasElement.width, canvasElement.height);

  canvasCtx.globalCompositeOperation = 'source-over';
  drawUtils.drawLandmarks(canvasCtx, results.poseLandmarks,
    {color: '#FF0000', lineWidth: 2});

  drawUtils.drawConnectors(canvasCtx, results.poseLandmarks, drawUtils.POSE_CONNECTIONS,
                  {color: '#FF0000', lineWidth: 4});
  canvasCtx.restore();

  if(params.OSC.enable){

    if(params.OSC.send_format == 'sendPosesJSON'){
      sendPosesJSON(results.poseLandmarks);
    }else if(params.OSC.send_format == 'sendPosesADDR'){
      sendPosesADDR(results)
    }

  }



  // if (osc.status() === OSC.STATUS.IS_OPEN) {
  //   osc.send( 'test', JSON.stringify( results.landmarks ) );
  // }

  // if ( Date.now() - timer > 5000) {
  //   timer = Date.now();
  //   console.log( results.poseLandmarks );
  // }

  stats.end();
}

document.body.addEventListener("keypress", function(){
  if (event.key == 'x'){
    ipcRenderer.send('float');
  }
})
