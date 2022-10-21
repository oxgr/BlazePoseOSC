## Onscreen GUI

### multiplePoses

Whether or not to detect multiple poses. The switch corresponds to `net.estimateSinglePose` and `net.estimateMultiplePoses` in PoseNet. Single mode is alledgedly faster (according to PoseNet developers), but sometimes multiple mode seem to give better detections even when there's only a single person.


### useTestImage

Sometimes it's hard to find a lot of friends to dance in front of your webcam while you debug your app. Check this box, and a test image containing human figures will move around the screen to help you with testing.

### audioHack

On some systems (e.g. my mac), if an electron app is obscured by other windows or otherwise inactive, its refresh rate will reduce to crawl. (Because Chrome or whatever try to help you save battery.) This is of course extremely undesirable since this app is specifically intended to run in the background.

This seems to be a [known issue](https://github.com/electron/electron/issues/9567) for electron, and I tried a couple of proposed fixes:

- `powerSaveBlocker.start('prevent-app-suspension');`
- `webPreferences: {backgroundThrottling:false, pageVisibility: true}`
- `app.commandLine.appendSwitch('disable-renderer-backgrounding');`

Unfortunately none of them worked. However I found a new hack:

If some sound is playing on the page, the page will be considered active. Therefore I added a hidden looping HTML audio that will play at an extremely low volume when the `audioHack` box is checked. The HTML audio cannot be muted, or have even lower volume, otherwise apparently the app will be considered inactive agian. So if your project doesn't involve listening to really really subtle sound, this hack will work perfectly. If not, there's another hidden hack:

**Press "X" key on your keyboard**, and the window will resize to 1 pixel by 1 pixel, and will float on top of all other apps. This way, the window is always visible (albeit only 1 pixel), and will always be considered active. Press X key again to return to normal mode.

### host/port

OSC host (something like 127.0.0.1) and OSC port (something like 8000). Press Enter key and they will be updated immediately.

### format

One of `ADDR`, `ARR`, `XML`, `JSON`. See **Parsing Received Data** section for details.


## More Settings

More settings can be found in `settings.json`. Some settings involves initializing the neural net are only loaded on start up, such as `poseNetConig`. See [PoseNet documentation](https://github.com/tensorflow/tfjs-models/tree/master/posenet) on what options you can specify. (Hint: their new ResNet seem to be much slower but not much better :P)

(The settings file for compiled macOS app can be found at `PoseOSC.app/Contents/Resources/app/settings.json`)


## Tracking

Posenet detects poses frame by frame, so there's no tracking at all that comes with it.

I plan to develop tracking as an optional feature. On one hand tracking is essential to make sense of the scene when there're multiple persons in the frame. But on the other hand, this will introduce some overhead (& JS is not too fast), and a serious user should be able to implement some tracking better suited to their application and use case.

## Demos

### Processing

See `/demos/PoseOSCProcessingReceiver`. First make sure PoseOSC is running, and that **`format` field is set to `XML`**, then fire up [Processing](http://processing.org) and run the demo. You'll see simple black lines indicating the poses.

### OpenFrameworks

See `/demos/PoseOSCOpenframeworksReceiver`. First compile the OF app (Xcode/make/etc.). While PoseOSC is running and the **`format` field is set to `ARR`**, run the OF app. You'll see simple black lines indicating the poses.


---

**Made possible with support from The [Frank-Ratchye STUDIO For Creative Inquiry](http://studioforcreativeinquiry.org/) at Carnegie Mellon University.**
