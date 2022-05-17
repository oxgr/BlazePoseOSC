const fs = require('fs');
const {ipcRenderer} = require('electron');
//const tf = require('@tensorflow/tfjs-node');
//const posenet = require('@tensorflow-models/posenet');
const Pose  = require('@mediapipe/pose/pose.js')
const OSC = require('osc-js');

var osc;

const Stats = require('stats.js');
const { Camera } = require('@mediapipe/camera_utils');
var stats = new Stats();
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

// var inputCanvas = document.createElement("canvas");
// var debugCanvas = document.createElement("canvas");
// var messageDiv = document.createElement("div");

//document.body.appendChild(debugCanvas);

// camera.style.position = "absolute";
// camera.style.left = "0px";
// camera.style.top = "0px";

// debugCanvas.style.position = "absolute";
// debugCanvas.style.left = "0px";
// debugCanvas.style.top = "0px";

// messageDiv.style.width = "100%";
// messageDiv.style.position = "absolute";
// messageDiv.style.left = "0px";
// messageDiv.style.bottom = "0px";
// messageDiv.style.backgroundColor = "rgba(0,0,0,0.4)";
// messageDiv.style.color = "white";
// messageDiv.style.fontFamily = "monospace"
// document.body.appendChild(messageDiv);


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

// function generateGUI(){
//   var div = document.createElement("div");
//   div.style.color="white";
//   div.style.fontFamily="monospace";
//   var d = document.createElement("div");
//   d.innerHTML = "SETTINGS";
//   d.style.backgroundColor = "rgba(0,0,0,0.3)"
//   div.appendChild(d);

//   for (var k in settings){
//     var d = document.createElement("div")
//     var lbl = document.createElement("span");
//     lbl.innerHTML = k;

//     if (typeof(settings[k]) == 'boolean'){
//       var cb = document.createElement("input");
//       cb.type = "checkbox";
//       cb.checked = settings[k];
      
//       ;(function(){
//         var _k = k;
//         var _cb = cb;
//         _cb.onclick = function(){
//           settings[_k] = _cb.checked;
//         }
//       })();
//       d.appendChild(cb);
//       d.appendChild(lbl);
//     }else if (typeof (settings[k]) == 'string'){
//       var inp = document.createElement("input");
//       inp.value = settings[k];
//       inp.style.backgroundColor = "rgba(0,0,0,0.3)";
//       inp.style.color = "white";
//       inp.style.fontFamily = "monospace";
//       inp.style.border = "1px solid black";

//       ;(function(){
//         var _k = k;
//         var _inp = inp;
//         _inp.onkeypress = function(){
//           if (event.key == "Enter"){
//             settings[_k] = _inp.value;
//           }
//         }
//       })();
//       d.appendChild(lbl);
//       d.appendChild(inp);
//     }
//     d.style.borderBottom = "1px solid black";
//     div.appendChild(d);
//   }
//   document.body.appendChild(div);
//   div.style.position = "absolute";
//   div.style.left = "0px";
//   div.style.top = "50px";
//   div.style.backgroundColor = "rgba(0,0,0,0.5)"
// }

// generateGUI();

function drawPose(pose,color="white"){
  var ctx = debugCanvas.getContext('2d');
  for (var i = 0; i < pose.keypoints.length; i++){
    var p = pose.keypoints[i].position
    ctx.fillStyle=color;
    ctx.fillRect(p.x-5,p.y-5,10,10);
    ctx.fillStyle="yellow";
    ctx.fillText(("0"+i).substr(-2)+" "+pose.keypoints[i].part,p.x+5,p.y-5);
  }
  const adj = [
    [0,1],[0,2],[1,3],[2,4],        //face
    [5,6],[11,12],[5,11],[6,12],    //body
    [5,7],[7,9],[6,8],[8,10],       //arms
    [11,13],[13,15],[12,14],[14,16],//legs
  ]
  const minConf = 0.5
  adj.forEach(([i,j]) => {
    if (pose.keypoints[i] < minConf || pose.keypoints[j] < minConf ){
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pose.keypoints[i].position.x, pose.keypoints[i].position.y);
    ctx.lineTo(pose.keypoints[j].position.x, pose.keypoints[j].position.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  });
}

function sendPosesADDR(poses){
  osc.send(new OSC.Message('/videoWidth',camera.videoWidth));
  osc.send(new OSC.Message('/videoHeight',camera.videoHeight));
  osc.send(new OSC.Message('/nPoses',poses.length));
  for (var i = 0; i < poses.length; i++){
    osc.send(new OSC.Message('/poses/'+i+"/score",poses[i].score))
    for (var j = 0; j < poses[i].keypoints.length; j++){
      var kpt = poses[i].keypoints[j];
      var pth = '/poses/'+i+"/keypoints/"+kpt.part+"/";
      osc.send(new OSC.Message(pth+"x",kpt.position.x));
      osc.send(new OSC.Message(pth+"y",kpt.position.y));
      osc.send(new OSC.Message(pth+"score",kpt.score));
    }
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


async function estimateFrame() {


  stats.begin();
  
  //open OSC communication
  if (osc.options.plugin.options.send.host != settings.host
    ||osc.options.plugin.options.send.port != settings.port){
    openOSC();
  }


  // audio hack thiong to keep the broswer working while not rendering the ctx.
  if (settings.audioHack && audio.paused){
    audio.play();
  }
  if (!settings.audioHack && !audio.paused){
    audio.pause();
  }


  // setup conetxts for display and debugs
  var ictx = inputCanvas.getContext('2d');
  var dctx = debugCanvas.getContext('2d');
  
  // test image in case tyou want to use test image 
  var testImageXPos = undefined;
  if (settings.useTestImage){
    if (!testImage){
      testImage = new Image;
      testImage.src = testImageUrl;
    }
    if (testImage.complete){
      testImageXPos = Math.sin(frameCount*0.1)*20;
      ictx.drawImage(testImage,testImageXPos,0);
    }
  }else{
    ictx.drawImage(camera,0,0);
  }



  var poses = [];
  if (settings.multiplePoses){
    poses = await net.estimateMultiplePoses(inputCanvas, {
      flipHorizontal: false
    });
  }else{
    poses[0]= await net.estimateSinglePose(inputCanvas, {
      flipHorizontal: false
    });
  }

  if (settings.format == "XML"){
    sendPosesXML(poses);
  }else if (settings.format == "JSON"){
    sendPosesJSON(poses);
  }else if (settings.format == "ADDR"){
    sendPosesADDR(poses);
  }else if (settings.format == "ARR"){
    sendPosesARR(poses);
  }

  messageDiv.innerHTML = ["/","-","\\","|"][frameCount%4]+" Detected "+poses.length+" pose(s), sending to "
    +osc.options.plugin.options.send.host+":"
    +osc.options.plugin.options.send.port;

  dctx.clearRect(0,0,dctx.canvas.width,dctx.canvas.height);
  if (settings.useTestImage && testImageXPos != undefined){
    dctx.drawImage(testImage,testImageXPos,0);
  }
  poses.forEach((pose,i)=>{
    drawPose(pose,["white","cyan","magenta","yellow"][i%5]);
  })

  stats.end();

  // setTimeout(estimateFrame,1);
  // requestAnimationFrame(estimateFrame);
  frameCount++;
}

//messageDiv.innerHTML = "Initializing app..."


const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

canvasCtx.canvas.width = window.innerWidth;
canvasCtx.canvas.height = 3*window.innerWidth/4;


Input_camera.onloadeddata = function(){
  //messageDiv.innerHTML = "Camera loaded. Loading PoseNet..."
  var [w,h] = [camera.videoWidth, camera.videoHeight];

  console.log("camera dimensions",w,h);

  // inputCanvas.width = w;
  // inputCanvas.height = h;

  // debugCanvas.width = w;
  // debugCanvas.height = h;

  ipcRenderer.send('resize', w, h);


  // //we do pose estimation here on each frame
  // posenet.load(settings.poseNetConfig).then(function(_net){
  //   messageDiv.innerHTML = "All loaded."
  //   net = _net;
  //   setInterval(estimateFrame,5);
  // });
}

let timer = Date.now();


const pose = new Pose.Pose({locateFile: (file) => {
  return `./node_modules/@mediapipe/pose/${file}`;
}});

console.log(pose)

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: true,
  smoothSegmentation: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
pose.onResults(onResults);

function onResults(results) {
  
  console.log(results.length)

  stats.begin();

  // if (!results.poseLandmarks) {
  //   grid.updateLandmarks([]);
  //   return;
  // }

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
  drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
                  {color: '#00FF00', lineWidth: 4});
  drawLandmarks(canvasCtx, results.poseLandmarks,
                {color: '#FF0000', lineWidth: 2});
  canvasCtx.restore();


  // if (osc.status() === OSC.STATUS.IS_OPEN) {
    
  //   osc.send( 'test', JSON.stringify( results.landmarks ) );
  // }


  // grid.updateLandmarks(results.poseWorldLandmarks);

  if ( Date.now() - timer > 5000) {
    timer = Date.now();
    console.log( results.poseLandmarks );
  }

  stats.end();
}

const camera = new Camera(Input_camera, {
  onFrame: async () => {
    await pose.send({image: Input_camera});
  },
  width: 720,
  height: 480
});
camera.start();

document.body.addEventListener("keypress", function(){
  if (event.key == 'x'){
    ipcRenderer.send('float');
  }
})
