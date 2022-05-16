

let synth;

let osc;

let line;

let p1, p2;

let lineArr;

let lineCol, cursorCol;

let cnv;

let loop;

let playing;

function setup() {

    cnv = createCanvas( 400, 400 );

    background( 'azure' )

    // synth = new p5.MonoSynth();

    // osc = new p5.SinOsc();

    reverb = new p5.Reverb();
    osc = new p5.SinOsc();
    osc.disconnect(); 
    reverb.process(osc, 3, 2, false);

    p1 = createVector();
    p2 = createVector();

    lineArr = [];

    lineCol = 'pink';
    cursorCol = 'red';

    strokeWeight( 6 );
    stroke( lineCol );

    loop = false;
    playing = false;

}

function draw() {


    
}

function mousePressed() {

    p1.set( mouseX, mouseY );
    lineArr.push({ x: mouseX, y: mouseY });

}

function mouseDragged() {

    p2.set( mouseX, mouseY );
    cnv.line( p1.x, p1.y, p2.x, p2.y );
    p1.set( mouseX, mouseY );
    lineArr.push({ x: mouseX, y: mouseY });

}

function mouseReleased() {



}

function keyPressed() {

    switch( keyCode ) {

        case 32:
            if ( !playing ) playDrawing( loop );
            break;

        case BACKSPACE:
            lineArr = [];
            background( 'azure' );
            break;

        case 65:
            loop = !loop;
            break;

    }

}


async function playDrawing( loop ) {

    // let osc = new p5.SinOsc();

    playing = true;
    
    osc.start();

    osc.amp( 0.1 );

    for ( let i = 0; i < lineArr.length - 1; i++ ) {

        const p = lineArr[ i ];
        const pn = lineArr[ i + 1 ];

        stroke( cursorCol );
        point( p.x, p.y );
        // cnv.line( p.x, p.y, pn.x, pn.y );

        const d = dist( p.x, p.y, pn.x, pn.y );
        const amp = constrain( map( d, 0, 100, 0, 1 ), 0, 1 );

        reverb.drywet( map( p.x, 0, width, 0, 1 ) );

        // osc.amp( amp );
        osc.freq( 1000 - p.y * 2 );
        await sleep( 10 );

        stroke( lineCol );
        point( p.x, p.y );
        // cnv.line( p.x, p.y, pn.x, pn.y );

    }

    osc.stop();

    // osc = null;

    playing = false;

    if ( loop ) playDrawing( loop );

}

// a custom 'sleep' or wait' function, that returns a Promise that resolves only after a timeout
function sleep(millisecondsDuration)
{
  return new Promise((resolve) => {
    setTimeout(resolve, millisecondsDuration);
  })
}