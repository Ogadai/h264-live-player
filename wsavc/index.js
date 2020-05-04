"use strict";

var Avc            = require('../broadway/Decoder');
var YUVWebGLCanvas = require('../canvas/YUVWebGLCanvas');
var YUVCanvas      = require('../canvas/YUVCanvas');
var Size           = require('../utils/Size');
var Class          = require('uclass');
var Events         = require('uclass/events');
var debug          = require('debug');
var log            = debug("wsavc");

var WSAvcPlayer = new Class({
  Implements : [Events],

  framesList: [],
  running: false,

  initialize : function(canvas, canvastype) {

    this.canvas     = canvas;
    this.canvastype = canvastype;

    // AVC codec initialization
    this.avc = new Avc();
    if(false) this.avc.configure({
      filter: "original",
      filterHorLuma: "optimized",
      filterVerLumaEdge: "optimized",
      getBoundaryStrengthsA: "optimized"
    });

    //WebSocket variable
    this.ws;
    this.pktnum = 0;

  },


  decode : function(data) {
    var naltype = "invalid frame";

    if (data.length > 4) {
      if (data[4] == 0x65) {
        naltype = "I frame";
      }
      else if (data[4] == 0x41) {
        naltype = "P frame";
      }
      else if (data[4] == 0x67) {
        naltype = "SPS";
      }
      else if (data[4] == 0x68) {
        naltype = "PPS";
      }
    }
    //log("Passed " + naltype + " to decoder");
    this.avc.decode(data);
  },

  connect : function(url) {
    // Websocket initialization
    var ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      log("Connected to " + url);
    };

    this.playFromWebSocket(ws);
  },

  playFromWebSocket: function(ws) {
    if (this.ws != undefined) {
      this.ws.close();
      delete this.ws;
    }
    this.ws = ws;

    this.ws.onmessage = (evt) => {
      if(typeof evt.data == "string")
        return this.cmd(JSON.parse(evt.data));

      var frame = new Uint8Array(evt.data);
      //log("[Pkt " + this.pktnum + " (" + evt.data.byteLength + " bytes)]");
      //this.decode(frame);
      this.addFrame(frame);
    };

    this.ws.onclose = () => {
      this.running = false;
      log("WSAvcPlayer: Connection closed")
    };

  },

  addFrame: function(frame) {
    this.pktnum++;
    this.framesList.push(frame);
    if (!this.running) {
      this.running = true;
      this.shiftFrame();
    }
  },

  shiftFrame: function() {
    if(!this.running)
      return;


    if(this.framesList.length > 3) {
      log("Dropping frames", this.framesList.length);
      this.framesList = [];
    }

    var frame = this.framesList.shift();

    if(frame)
      this.decode(frame);

    requestAnimationFrame(() => this.shiftFrame());
  },

  initCanvas : function(width, height) {
    var canvasFactory = this.canvastype == "webgl" || this.canvastype == "YUVWebGLCanvas"
                        ? YUVWebGLCanvas
                        : YUVCanvas;

    var canvas = new canvasFactory(this.canvas, new Size(width, height));
    this.avc.onPictureDecoded = canvas.decode;
    this.emit("canvasReady", width, height);
  },

  cmd : function(cmd){
    log("Incoming request", cmd);

    if(cmd.action == "init") {
      this.initCanvas(cmd.width, cmd.height);
      this.canvas.width  = cmd.width;
      this.canvas.height = cmd.height;
    }
  },

  disconnect : function() {
    this.ws.close();
  },

  playStream : function() {
    var message = "REQUESTSTREAM ";
    this.ws.send(message);
    log("Sent " + message);
  },


  stopStream : function() {
    this.ws.send("STOPSTREAM");
    log("Sent STOPSTREAM");
  },
});


module.exports = WSAvcPlayer;
module.exports.debug = debug;
