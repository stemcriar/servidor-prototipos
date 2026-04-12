var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var moment = require('moment')

var indexRouter = require('./routes/index');
var manipuladorRouter = require('./routes/manipulador');
var carrinhoRouter = require('./routes/carrinho');
var dashboardRouter = require('./routes/dashboard'); 

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}
function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

var WebSocket = require('ws');
var https = require('https');

var wss = new WebSocket.Server({ port: 1801 });

function startWss(sslOptions) {
  var sslServer = https.createServer(sslOptions);
  var wssSecure = new WebSocket.Server({ server: sslServer });
  sslServer.listen(1802, function () {
    // console.log('WSS (seguro) rodando na porta 1802');
  });
  wssSecure.on('connection', handleConnection);
}

var Esp = require("./classes/ESP.js");
var ping  = Esp.ping;
var heartbeat = Esp.heartbeat;

var Page = require("./classes/Page.js");
var pingPage = Page.pingPage;
var heartbeatPage = Page.heartbeatPage;

const interval = setInterval(function(){
  ping();
  pingPage();
}, 3000);

wss.on('close', function close() {
  clearInterval(interval);
});

global.esps = [];
global.pages = [];
global.rooms = [];

function handleConnection(ws, request) {
  ws.on('pong', function(){
    heartbeat(ws);
    heartbeatPage(ws);
  });

  ws.on('message', function incoming(message) {
    try {
      messageJson = JSON.parse(message);
    }
    catch(err){
      console.log("Erro: ", err);
    }

    if(messageJson['start'] == "ESP_on"  && messageJson.espType){
      var id = request.socket.remoteAddress.toString().split(".")[3];
      var nomeDeExibicao = messageJson.espName || "ID: " + id;
      global.esps.push(new Esp(ws, id, true, messageJson.espType, nomeDeExibicao));
      console.log(moment().format('MMMM Do YYYY, h:mm:ss a'), " || ESP ", global.esps[global.esps.length-1].type + 
                                                                      " id: " + global.esps[global.esps.length-1].id)
    };

    if(messageJson['start'] == "page_on"){
      var id = request.socket.remoteAddress.toString().split(".")[3];
      global.pages.push(new Page(ws, id, messageJson['to'], true));
      lastPage = global.pages[global.pages.length-1];
      global.esps.forEach(esp => {
        if (esp.id == lastPage.pageEsp){
          global.rooms.push({"pageConnection": lastPage.connection, "espConnection": esp.connection});
          esp.taken = true;
          console.log("The page ", lastPage.id, "is communicating with ESP of id:", esp.id);
        };
      });
    };

    global.rooms.forEach(room => {
      if(ws == room["pageConnection"]){
        room["espConnection"].send(message);
      }
      else if (ws == room['espConnection']){
        room["pageConnection"].send(ab2str(message));
      };
    });

  console.log('received: %s', message);
  });
}

wss.on('connection', handleConnection);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/manipulador', manipuladorRouter);
app.use('/carrinho', carrinhoRouter);
app.use('/dashboard', dashboardRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
module.exports.startWss = startWss;
