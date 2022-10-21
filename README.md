# BlazePoseOSC
Send realtime human pose estimation data to your apps! An adapted version of Lingdong Huang's PoseOSC using Mediapipe's more accurate + performant BlazePose model and GPU backend.

- ~~[PoseNet](https://github.com/tensorflow/tfjs-models/tree/master/posenet)~~ [BlazePose](https://google.github.io/mediapipe/solutions/pose.html) + [Open Sound Control](http://opensoundcontrol.org/spec-1_0) (via [osc-js](https://www.npmjs.com/package/osc-js))
- Built with [electron](http://electronjs.org)
- Forked from [PoseOSC](https://github.com/LingDongHuang/PoseOSC), 
- Originally inspired by [FaceOSC](https://github.com/kylemcdonald/ofxFaceTracker/releases)


## Download / Installation

Use [NPM](http://npmjs.com) to install and run the app.

```
npm install
npm start
```

macOS binaries can be [downloaded here in release page](https://github.com/oxgr/BlazePoseOSC/releases). Binaries for other platforms coming soon.

## Parsing Received Data

BlazePoseOSC currently support 4 formats when transferring data through OSC: `ADDR`, `ARR`, `XML` and `JSON`. This can be specified by editing the `format` field on the onscreen GUI. You can pick one that best suits your use case (`ARR` is recommanded for optimal speed).

In `ADDR` mode, each piece of info is sent to a different OSC Address, such as `poses/0/leftWrist/position` or `poses/2/rightElbow/score`. It is relatively easy for a client app with any OSC implementation to read the input. However, it becomes problematic when there are multiple detections in the frame. As PoseNet does detection frame by frame, the "first" pose in one frame might not be the first pose in the next frame. Since all the coordinate are sent to different addresses and OSC does not guarantee the exact order of which they're received, you might read a pose whose lower half belongs to one person while its upper body belongs to another person.

Therefore, it makes sense to send all the data in an entire frame to one single OSC address when there're multiple persons in the frame. `XML` and `JSON` modes encodes all the poses in a given frame, and send it as a string. The client app can then use an XML/JSON parser (for most languages there are many) (plus some small overhead) to extract the pose information. `ARR` mode sends all the data of a frame as a big flat array of values to a single address, this will probably be fastest out of the four, but you'll need to know how interpret the values correctly (by reading example below) as no extra description/hint is being sent.


For more information (e.g. How many keypoints are there for 1 person, etc.) please read [PoseNet's specification](https://github.com/tensorflow/tfjs-models/tree/master/posenet)

### Method 1: ADDR
```
/nPoses 3
/videoWidth 640
/videoHeight 480
/poses/0/score 0.8
/poses/0/keypoints/leftWrist/x 234.4
/poses/0/keypoints/leftWrist/y 432.5
/poses/0/keypoints/leftWrist/score 0.9
/poses/0/keypoints/rightElbow/x 456.2
/poses/0/keypoints/rightElbow/y 654.1
/poses/0/keypoints/rightElbow/score 0.9
...
/poses/1/score 0.7
/poses/1/keypoints/leftWrist/x 789.0
/poses/1/keypoints/leftWrist/y 987.2
...
/poses/2/keypoints/rightAnkle/score 0.2
```

### Method 2: XML
```
<poses videoWidth="640" videoHeight="480" nPoses="3">

	<pose score="0.8">
		<keypoint part="leftWrist" x="234.4" y="432.5" score="0.9"/>
		<keypoint part="rightElbow" x="456.2" y="654.1" score="0.95"/>
		...
	</pose>

	<pose score="0.7">
		<keypoint part="leftWrist" x="789.0" y="987.2" score="0.6"/>
		...
	</pose>
	
	...

</poses>

```
XML will be sent to `poses/xml` OSC Address as a string. The Processing example included in `/demos` folder uses XML parsing.

### Method 3: JSON

JSON format is exactly the same as that of PoseNet's output, see [their documentation](https://github.com/tensorflow/tfjs-models/tree/master/posenet).

JSON will be sent to `poses/json` OSC Address as a string.

### Method 4: ARR

ARR will be sent to `poses/arr` OSC Address as an array of values (OSC spec allows multiple values of different types for each address).

- The frist value (int) is width of the frame.
- The second value (int) is height of the frame.
- The third value (int) is the number of poses. (When you read this value, you'll know how many more values to read, i.e. `nPoses*(1+17*3)`. So if this number is 0 it means no pose is detected, so you can stop reading).
- The next 52 values are data for the first pose, and the 52 values after that are data for the second pose (if there is), and so on...
- For each pose, the first value (float) is the score for that pose, the rest 51 values (floats) can be divided into 17 groups of 3, with each group being (x,y,score) of a keypoint. For the ordering of keypoints, see [PoseNet spec](https://github.com/tensorflow/tfjs-models/tree/master/posenet).

The OpenFrameworks example included in `/demo` folder receives `ARR` format.
